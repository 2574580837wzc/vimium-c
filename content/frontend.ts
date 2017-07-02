var VSettings: VSettings, VHUD: VHUD, VPort: VPort, VEventMode: VEventMode;

(function() {
  interface EscF {
    <T extends HandlerResult>(this: void, i: T): T;
    (this: void): void;
  }
  interface Port extends chrome.runtime.Port {
    postMessage<K extends keyof FgReq>(request: Req.fg<K>): 1;
    postMessage<K extends keyof FgRes>(request: Req.fgWithRes<K>): 1;
  }
  const enum ListenType {
    None = 0,
    Blur = 1,
    Full = 2,
  }
  interface ShadowRootEx extends ShadowRoot {
    vimiumListened?: ListenType;
  }
  type LockableElement = HTMLElement;

  var KeydownEvents: KeydownCacheArray, keyMap: KeyMap
    , currentKeys = "", isEnabledForUrl = false
    , mapKeys = null as SafeDict<string> | null, nextKeys = null as KeyMap | ReadonlyChildKeyMap | null
    , esc = function(i?: HandlerResult): HandlerResult | void { currentKeys = ""; nextKeys = null; return i; } as EscF
    , onKeyup2 = null as ((this: void, event: KeyboardEvent) => void) | null, passKeys = null as SafeDict<true> | null;

  const isInjected = window.VimiumInjector ? true : null,
  vPort = {
    port: null as Port | null,
    _callbacks: Object.create(null) as { [msgId: number]: <K extends keyof FgRes>(this: void, res: FgRes[K]) => void },
    _id: 1,
    post: function<K extends keyof FgReq> (this: void, request: FgReq[K] & Req.baseFg<K>): 1 {
      return (vPort.port as Port).postMessage(request);
    } as VPort["post"],
    send: function<K extends keyof FgRes> (this: void, request: FgReq[K] & Req.baseFg<K>
        , callback: (this: void, res: FgRes[K]) => void): void {
      let id = ++vPort._id;
      (vPort.port as Port).postMessage({_msgId: id, request: request});
      vPort._callbacks[id] = callback;
    } as VPort["send"],
    safePost<K extends keyof FgReq> (request: FgReq[K] & Req.baseFg<K>): void {
      try {
        if (!this.port) {
          this.connect(PortType.nothing);
          isInjected && setTimeout(function() { esc && !vPort.port && VSettings.destroy(); }, 50);
        }
        (this.port as Port).postMessage(request);
      } catch (e) { // this extension is reloaded or disabled
        VSettings.destroy();
      }
    },
    Listener<K extends keyof FgRes, T extends keyof BgReq> (this: void
        , response: Req.res<K> | (Req.bg<T> & { _msgId?: undefined; })): void {
      let id: number | undefined;
      if (id = response._msgId) {
        const arr = vPort._callbacks, handler = arr[id];
        delete arr[id];
        return handler((response as Req.res<K>).response);
      } else {
        return requestHandlers[(response as Req.bg<T>).name as T](response as Req.bg<T>);
      }
    },
    ClearPort (this: void): void {
      vPort.port = null;
      requestHandlers.init && setTimeout(function(): void {
        try { esc && vPort.connect(PortType.initing); } catch(e) { VSettings.destroy(); }
      }, 2000);
    },
    connect (isFirst: PortType.nothing | PortType.initing): void {
      const data = { name: "vimium++." + (PortType.isTop * +(window.top === window) + PortType.hasFocus * +document.hasFocus() + isFirst) };
      const port = this.port = isInjected ? chrome.runtime.connect(VimiumInjector.id, data) as Port
        : chrome.runtime.connect(data) as Port;
      port.onDisconnect.addListener(this.ClearPort);
      port.onMessage.addListener(this.Listener);
    }
  },

  ELs = { //
    onKeydown (event: KeyboardEvent): void {
      if (!isEnabledForUrl || event.isTrusted == false || !(event instanceof KeyboardEvent)) { return; }
      if (VScroller.keyIsDown && VEventMode.OnScrolls[0](event)) { return; }
      let keyChar: string, key = event.keyCode, action: HandlerResult;
      if (action = VHandler.bubbleEvent(event)) {
        if (action < HandlerResult.MinMayNotPassKey) { return; }
      }
      else if (InsertMode.isActive()) {
        if (InsertMode.lock === document.body && InsertMode.lock) { return; }
        const g = InsertMode.global;
        if (g ? !g.code ? VKeyboard.isEscape(event)
              : key === g.code && VKeyboard.getKeyStat(event) === g.stat
            : VKeyboard.isEscape(event)
              || (key > VKeyCodes.maxNotFn && (keyChar = VKeyboard.getKeyName(event)) &&
                (action = checkValidKey(event, keyChar)), false)
          ) {
          InsertMode.exit(event);
          action = g && g.passExitKey ? HandlerResult.Nothing : HandlerResult.Prevent;
        }
      }
      else if (key >= VKeyCodes.space || key === VKeyCodes.backspace) {
        if (keyChar = VKeyboard.getKeyChar(event)) {
          action = checkValidKey(event, keyChar);
          if (action === HandlerResult.Nothing && InsertMode.suppressType && keyChar.length === 1) {
            action = HandlerResult.Prevent;
          }
        }
      }
      else if (key !== VKeyCodes.esc || VKeyboard.getKeyStat(event)) {}
      else if (nextKeys !== null) {
        esc(HandlerResult.Suppress);
        action = HandlerResult.Prevent;
      } else if (VDom.UI.removeSelection()) {
        action = HandlerResult.Prevent;
      } else if (event.repeat) {
        let c = document.activeElement; c && c.blur && c.blur();
      }
      if (action === HandlerResult.Nothing) { return; }
      if (action === HandlerResult.Prevent) {
        event.preventDefault();
      }
      event.stopImmediatePropagation();
      KeydownEvents[key] = 1;
    },
    onKeyup (event: KeyboardEvent): void {
      if (!isEnabledForUrl || event.isTrusted == false || !(event instanceof KeyboardEvent)) { return; }
      VScroller.keyIsDown = 0;
      if (InsertMode.suppressType && VDom.selType() !== InsertMode.suppressType) {
        VEventMode.setupSuppress();
      }
      if (KeydownEvents[event.keyCode]) {
        KeydownEvents[event.keyCode] = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (onKeyup2) {
        return onKeyup2(event);
      }
    },
    onFocus (event: Event | FocusEvent): void {
      if (event.isTrusted == false) { return; }
      let target = event.target as EventTarget | Element;
      if (target === window) {
        return ELs.OnWndFocus();
      }
      if (!isEnabledForUrl) { return; }
      // it's safe to compare .lock and doc.activeEl here without checking target.shadowRoot,
      // and .shadowRoot should not block this check;
      // note: this ignores the case that <form> is in a shadowDom
      // note: DO NOT stop propagation
      if (target === VDom.UI.box) { return event.stopImmediatePropagation(); }
      if (InsertMode.lock !== null && InsertMode.lock === document.activeElement) { return; }
      if ((target as Element).shadowRoot != null) {
        let path = event.path as EventTarget[]
          , diff = !!path && (target = path[0]) !== event.target && target !== window, len = diff ? path.indexOf(target) : 1;
        diff || (path = [(event.target as Element).shadowRoot as ShadowRoot | Element]);
        while (0 <= --len) {
          const root = path[len];
          if (!(root instanceof ShadowRoot) || (root as ShadowRootEx).vimiumListened === ListenType.Full) { continue; }
          root.addEventListener("focus", ELs.onFocus, true);
          root.addEventListener("blur", ELs.onShadowBlur, true);
          (root as ShadowRootEx).vimiumListened = ListenType.Full;
        }
      }
      if (VDom.getEditableType(target)) {
        if (InsertMode.grabFocus) {
          event.stopImmediatePropagation();
          (target as HTMLElement).blur();
          return;
        }
        InsertMode.lock = target as HTMLElement;
        if (InsertMode.mutable) {
          InsertMode.last = target as HTMLElement;
        }
      }
    },
    onBlur (event: Event | FocusEvent): void {
      if (event.isTrusted == false) { return; }
      let target = event.target as Window | Element | ShadowRootEx;
      if (target === window) {
        VScroller.keyIsDown = 0;
        ELs.OnWndBlur && ELs.OnWndBlur.call(null);
        KeydownEvents = new Uint8Array(256);
        (<RegExpOne> /a?/).test("");
        return esc();
      }
      if (!isEnabledForUrl) { return; }
      let path = event.path as EventTarget[], top: EventTarget | undefined
        , same = !path || (top = path[0]) === target || top === window, sr = (target as Element).shadowRoot;
      if (InsertMode.lock === (same ? target : top)) { InsertMode.lock = null; }
      if (!(sr !== null && sr instanceof ShadowRoot) || target === VDom.UI.box) { return; }
      if (same) {
        (sr as ShadowRootEx).vimiumListened = ListenType.Blur;
        // NOTE: if destroyed, this page must have lost its focus before, so
        // a blur event must have been bubbled from shadowRoot to a real lock.
        // Then, we don't need to worry about ELs or InsertMode being null.
        sr.removeEventListener("focus", ELs.onFocus, true);
        return;
      }
      for (let len = path.indexOf(target); 0 <= --len; ) {
        const root = path[len];
        if (!(root instanceof ShadowRoot)) { continue; }
        root.removeEventListener("focus", ELs.onFocus, true);
        root.removeEventListener("blur", ELs.onShadowBlur, true);
        (root as ShadowRootEx).vimiumListened = ListenType.None;
      }
    },
    onShadowBlur (this: ShadowRootEx, event: Event): void {
      if (event.isTrusted == false) { return; }
      if (this.vimiumListened === ListenType.Blur) {
        this.vimiumListened = ListenType.None;
        this.removeEventListener("blur", ELs.onShadowBlur, true);
      }
      return ELs.onBlur(event);
    },
    onActivate (event: UIEvent): void {
      VScroller.current = (event.path as EventTarget[])[0] as Element;
    },
    OnWndFocus (this: void): void {},
    OnWndBlur: null as ((this: void) => void) | null,
    OnReady (inited?: boolean): void {
      const visible = isEnabledForUrl && location.href !== "about:blank" && innerHeight > 9 && innerWidth > 9;
      VDom.UI.setOuterCSS(visible && VSettings.cache.userDefinedOuterCss);
      if (inited) { return; }
      HUD.enabled = true;
      ELs.OnWndFocus = vPort.safePost.bind(vPort, { handler: "frameFocused" });
    },
    hook (f: typeof addEventListener | typeof removeEventListener, skipFocus?: 1): void {
      f("keydown", this.onKeydown, true);
      f("keyup", this.onKeyup, true);
      skipFocus || f("focus", this.onFocus, true);
      f("blur", this.onBlur, true);
      f.call(document, "DOMActivate", ELs.onActivate, true);
    }
  },

  Commands = {
    Find: VFindMode,
    Hints: VHints,
    Marks: VMarks,
    Scroller: VScroller,
    Visual: VVisualMode,
    Vomnibar,
    reset (): void {
      const a = InsertMode;
      VScroller.current = VDom.lastHovered = a.last = a.lock = a.global = null;
      a.mutable = true;
      a.ExitGrab(); VEventMode.setupSuppress();
      VHints.clean(); VVisualMode.deactivate();
      VFindMode.init || VFindMode.toggleStyle(1);
      KeydownEvents = new Uint8Array(256);
    },

    toggleSwitchTemp (_0: number, options: FgOptions): void {
      const key = (options.key || "") + "" as keyof SettingsNS.FrontendSettingCache,
      cache = VSettings.cache, old = cache[key], Key = '"' + key + '"', last = "old" + key;
      let val = options.value, isBool = typeof val === "boolean", msg: string | undefined;
      if (!(key in cache)) {
        msg = 'unknown setting' + key;
      } else if (typeof old === "boolean") {
        isBool || (val = !old);
      } else if (isBool) {
        msg = Key + 'is not a boolean switch';
      } else if (!(last in cache)) {
        (cache as Dict<any>)[last] = old;
      } else if (old === val) {
        val = (cache as Dict<any>)[last];
        delete (cache as Dict<any>)[last];
      }
      if (!msg) {
        cache[key] = val;
        msg = val === false ? Key + " has been turned off"
          : "Now " + Key + (val === true ? " is on" : " use " + JSON.stringify(val));
      }
      return VHUD.showForDuration(msg, 1000);
    },
    enterInsertMode (_0: number, opt: CmdOptions["enterInsertMode"]): void {
      let { code, stat } = opt;
      InsertMode.global = opt;
      if (opt.hud) { return HUD.show(`Insert mode${code ? `: ${code}/${stat}` : ""}`); }
    },
    passNextKey (count: number, options: FgOptions): void {
      const keys = Object.create<BOOL>(null);
      let keyCount = 0;
      if (options.normal) {
        const func = esc;
        esc = function(i?: HandlerResult): HandlerResult | void {
          if (i === HandlerResult.Prevent && 0 >= --count || i === HandlerResult.Suppress) {
            HUD.hide();
            return (esc = func)(HandlerResult.Prevent);
          }
          currentKeys = ""; nextKeys = keyMap;
          return i;
        } as EscF;
        return HUD.show("Normal mode (pass keys disabled)" + (count > 1 ? `: ${count} times` : ""));
      }
      VHandler.push(function(event) {
        keyCount += +!keys[event.keyCode];
        keys[event.keyCode] = 1;
        return HandlerResult.PassKey;
      }, keys);
      onKeyup2 = function(event): void {
        if (keyCount === 0 || --keyCount || --count) {
          keys[event.keyCode] = 0;
          return HUD.show(`Pass next ${count > 1 ? count + " keys." : "key."}`);
        }
        return (ELs.OnWndBlur as () => void)();
      };
      ELs.OnWndBlur = function(): void {
        onKeyup2 = null;
        VHandler.remove(keys);
        ELs.OnWndBlur = null;
        return HUD.hide();
      };
      return onKeyup2({keyCode: 0} as KeyboardEvent);
    },
    goNext (_0: number, {dir, patterns}: CmdOptions["goNext"]): void {
      if (!VDom.isHTML() || Pagination.findAndFollowRel(dir)) { return; }
      const isNext = dir === "next";
      if (patterns.length <= 0 || !Pagination.findAndFollowLink(patterns, isNext ? "<" : ">")) {
        return VHUD.showForDuration("No links to go " + dir);
      }
    },
    reload (url: number | string, options?: FgOptions): void {
      const force = !!(options && options.force);
      setTimeout(function() {
        typeof url !== "string" ? window.location.reload(force) : (window.location.href = url);
      }, 17);
    },
    switchFocus (): void {
      let newEl = InsertMode.lock;
      if (newEl) {
        InsertMode.last = newEl;
        InsertMode.mutable = false;
        newEl.blur();
        return;
      }
      newEl = InsertMode.last;
      if (!newEl) {
        return HUD.showForDuration("Nothing was focused", 1200);
      }
      if (!VDom.ensureInView(newEl) && VDom.NotVisible(newEl)) {
        return HUD.showForDuration("The last focused is hidden", 2000);
      }
      InsertMode.last = null;
      InsertMode.mutable = true;
      return VDom.UI.simulateSelect(newEl, false, true);
    },
    simBackspace (): void {
      const el = InsertMode.lock;
      if (!el) { return Commands.switchFocus(); }
      if (VDom.ensureInView(el)) { document.execCommand("delete"); }
    },
    goBack (count: number, options: FgOptions): void {
      const step = Math.min(count, history.length - 1);
      step > 0 && history.go(step * (+options.dir || -1));
    },
    goUp (count: number, options: FgOptions): void {
      const trail = options.trailing_slash;
      return vPort.send({
        handler: "parseUpperUrl",
        url: window.location.href,
        trailing_slash: trail != null ? !!trail : null,
        upper: -count
      }, function(result): void {
        if (result.path != null) {
          return Commands.reload(result.url);
        }
        return HUD.showForDuration(result.url);
      });
    },
    showHelp (msg?: number | "exitHD"): void {
      if (msg === "exitHD") { return; }
      let wantTop = window.innerWidth < 400 || window.innerHeight < 320;
      if (!VDom.isHTML()) {
        if (window === window.top) { return; }
        wantTop = true;
      }
      wantTop || VDom.UI.InitInner && VDom.UI.addElement(null, { fake: true });
      vPort.post({ handler: "initHelp", wantTop });
    },
    autoCopy (_0: number, options: FgOptions): void {
      let str = VDom.getSelectionText();
      if (!str) {
        str = options.url ? window.location.href : document.title;
        (options.decoded || options.decode) && (str = VUtils.decodeURL(str));
      }
      (str.length >= 4 || str.trim()) && vPort.post({
        handler: "copyToClipboard",
        data: str
      });
      return HUD.showCopied(str);
    },
    autoOpen (_0: number, options: FgOptions): void {
      let str: string, keyword = (options.keyword || "") + "";
      if (str = VDom.getSelectionText()) {
        VUtils.evalIfOK(str) || vPort.post({
          handler: "openUrl",
          keyword,
          url: str
        });
        return;
      }
      return vPort.send({
        handler: "openCopiedUrl",
        keyword
      }, function(str): void {
        if (str) {
          VUtils.evalIfOK(str);
        } else {
          return HUD.showCopied("");
        }
      });
    },
    searchAs (): void {
      return vPort.send({
        handler: "searchAs",
        url: window.location.href,
        search: VDom.getSelectionText()
      }, function(str): void {
        if (str) { return HUD.showForDuration(str, 1000); }
      });
    },
    focusInput (count: number, options: FgOptions): void {
      const visibleInputs = VHints.traverse("*", VHints.GetEditable);
      let sel = visibleInputs.length;
      if (sel === 0) {
        return HUD.showForDuration("There are no inputs to focus.", 1000);
      } else if (sel === 1) {
        return VDom.UI.simulateSelect(visibleInputs[0][0], true, true);
      }
      const arr = VDom.getViewBox(),
      hints = visibleInputs.map(function(link) {
        const hint = VDom.createElement("span") as HintsNS.Marker,
        rect = VDom.fromClientRect(link[0].getBoundingClientRect());
        rect[0]--, rect[1]--, rect[2]--, rect[3]--;
        hint.className = "IH";
        hint.clickableItem = link[0];
        VDom.setBoundary(hint.style, rect);
        return hint;
      });
      if (count === 1 && InsertMode.last) {
        sel = Math.max(0, visibleInputs.map(link => link[0]).indexOf(InsertMode.last));
      } else {
        sel = Math.min(count, sel) - 1;
      }
      hints[sel].classList.add("S");
      VDom.UI.simulateSelect(visibleInputs[sel][0]);
      const box = VDom.UI.addElementList(hints, arr), keep = !!options.keep, pass = !!options.passExitKey;
      VHandler.push(function(event) {
        const { keyCode } = event, oldSel = sel;
        if (keyCode === VKeyCodes.tab) {
          if (event.shiftKey) {
            if (--sel === -1) { sel = hints.length - 1; }
          }
          else if (++sel === hints.length) { sel = 0; }
          VDom.UI.simulateSelect(hints[sel].clickableItem);
          hints[oldSel].classList.remove("S");
          hints[sel].classList.add("S");
          return HandlerResult.Prevent;
        }
        if (keyCode === VKeyCodes.shiftKey || keyCode === VKeyCodes.altKey) {}
        else if (event.repeat) { return HandlerResult.Prevent; }
        else if (keep ? !VKeyboard.isEscape(event) : keyCode === VKeyCodes.ime || keyCode === VKeyCodes.f12) {}
        else {
          this.remove();
          VHandler.remove(this);
          return !VKeyboard.isEscape(event) ? HandlerResult.Nothing : keep || !InsertMode.lock ? HandlerResult.Prevent
            : pass ? HandlerResult.PassKey : HandlerResult.Nothing;
        }
        return HandlerResult.Nothing;
      }, box);
    }
  },

  InsertMode = {
    grabFocus: document.readyState !== "complete",
    global: null as CmdOptions["enterInsertMode"] | null,
    suppressType: null as string | null,
    last: null as LockableElement | null,
    lock: null as LockableElement | null,
    mutable: true,
    init (): void {
      /** if `notBody` then `activeEl` is not null  */
      let activeEl = document.activeElement as Element, notBody = activeEl !== document.body;
      KeydownEvents = new Uint8Array(256);
      if (VSettings.cache.grabFocus && this.grabFocus) {
        if (notBody) {
          activeEl.blur && activeEl.blur();
          notBody = (activeEl = document.activeElement as Element) !== document.body;
        }
        if (!notBody) {
          VHandler.push(this.ExitGrab, this);
          return addEventListener("mousedown", this.ExitGrab, true);
        }
      }
      this.grabFocus = false;
      if (notBody && VDom.getEditableType(activeEl)) {
        this.lock = activeEl as HTMLElement;
      }
    },
    ExitGrab: function (this: void, event?: Req.fg<"exitGrab"> | MouseEvent | KeyboardEvent): HandlerResult.Nothing | void {
      const _this = InsertMode;
      if (!_this.grabFocus) { return; }
      _this.grabFocus = false;
      removeEventListener("mousedown", _this.ExitGrab, true);
      VHandler.remove(_this);
      !(event instanceof Event) || !window.frames.length && window === window.top ||
      vPort.post({ handler: "exitGrab" });
      if (event instanceof KeyboardEvent) { return HandlerResult.Nothing; }
    } as {
      (this: void, event: KeyboardEvent): HandlerResult.Nothing;
      (this: void, request: Req.bg<"exitGrab">): void;
      (this: void, event?: MouseEvent): void;
    },
    isActive (): boolean {
      if (this.suppressType) { return false; }
      if (this.lock !== null || this.global) {
        return true;
      }
      let el = document.activeElement;
      if (el && (el as HTMLElement).isContentEditable === true && el instanceof HTMLElement) {
        this.lock = el;
        return true;
      } else {
        return false;
      }
    },
    exit (event: KeyboardEvent): void {
      let target: Element | null = event.target as Element;
      if ((target as HTMLElement).shadowRoot instanceof ShadowRoot) {
        if (target = this.lock) {
          this.lock = null;
          (target as HTMLElement).blur();
        }
      } else if (target === this.lock ? (this.lock = null, 1) : VDom.getEditableType(target)) {
        (target as HTMLElement).blur();
      }
      if (this.global) {
        this.lock = null; this.global = null;
        return HUD.hide();
      }
    },
    onExitSuppress: null as ((this: void) => void) | null
  },

Pagination = {
  followLink (linkElement: Element): boolean {
    if (linkElement instanceof HTMLLinkElement) {
      Commands.reload(linkElement.href);
    } else {
      VDom.ensureInView(linkElement);
      VDom.UI.flash(linkElement);
      setTimeout(function() { VDom.UI.click(linkElement); }, 0);
    }
    return true;
  },
  GetLinks (this: HTMLElement[], element: Element): void {
    if (!(element instanceof HTMLElement) || element instanceof HTMLFormElement) { return; }
    let s: string | null;
    const isClickable = element instanceof HTMLAnchorElement || (
      element instanceof HTMLButtonElement ? !element.disabled
      : element.vimiumHasOnclick || element.getAttribute("onclick") || (
        (s = element.getAttribute("role")) ? (s = s.toLowerCase(), s === "link" || s === "button")
        : VHints.ngEnabled && element.getAttribute("ng-click")));
    if (!isClickable) { return; }
    if ((s = element.getAttribute("aria-disabled")) != null && (!s || s.toLowerCase() === "true")) { return; }
    const rect = element.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2 && window.getComputedStyle(element).visibility === "visible") {
      this.push(element);
    }
  },
  findAndFollowLink (names: string[], refusedStr: string): boolean {
    interface Candidate { [0]: HTMLElement; [1]: number; [2]: string; }
    const links = VHints.traverse("*", this.GetLinks, document);
    links.push(document.documentElement as HTMLElement);
    let candidates: Candidate[] = [], ch: string, s: string, maxLen = 99, len: number;
    for (let re1 = <RegExpOne> /\s+/, _len = links.length - 1; 0 <= --_len; ) {
      const link = links[_len];
      if (link.contains(links[_len + 1]) || (s = link.innerText).length > 99) { continue; }
      if (!s && !(s = (ch = (link as HTMLInputElement).value) && ch.toLowerCase && ch || link.title)) { continue; }
      s = s.toLowerCase();
      for (ch of names) {
        if (s.indexOf(ch) !== -1) {
          if (s.indexOf(refusedStr) === -1 && (len = s.split(re1).length) <= maxLen) {
            len < maxLen && (maxLen = len + 1);
            candidates.push([link, len + (candidates.length / 10000), s]);
          }
          break;
        }
      }
    }
    if (candidates.length <= 0) { return false; }
    maxLen += 1;
    candidates = candidates.filter(a => a[1] < maxLen).sort((a, b) => a[1] - b[1]);
    const re2 = <RegExpOne> /\b/;
    for (s of names) {
      const re3 = re2.test(s[0]) || re2.test(s.slice(-1))
        ? new RegExp("\\b" + s + "\\b", "i") : new RegExp(s, "i");
      for (let cand of candidates) {
        if (re3.test(cand[2])) {
          return this.followLink(cand[0]);
        }
      }
    }
    return false;
  },
  findAndFollowRel (relName: string): boolean {
    const elements = document.querySelectorAll("[rel]"),
    relTags = Object.setPrototypeOf({a: 1, area: 1, link: 1}, null);
    let s: string | null;
    for (let _i = 0, _len = elements.length; _i < _len; _i++) {
      const element = elements[_i];
      if (!(element instanceof HTMLFormElement) && (element.tagName.toLowerCase() in relTags)
          && element instanceof HTMLElement
          && (s = (element as HTMLAnchorElement).rel) && s.toLowerCase() === relName) {
        return this.followLink(element);
      }
    }
    return false;
  }
},
  FrameMask = {
    more: false,
    node: null as HTMLDivElement | null,
    timer: 0,
    Focus (this: void, request: BgReq["focusFrame"]): void {
      if (request.mask !== FrameMaskType.NormalNext) {}
      else if (window.innerWidth < 3 || window.innerHeight < 3
        || document.body instanceof HTMLFrameSetElement) {
        vPort.post({
          handler: "nextFrame"
        });
        return;
      }
      VEventMode.focusAndListen();
      esc();
      VEventMode.suppress(request.lastKey);
      if (request.mask < FrameMaskType.minWillMask || !VDom.isHTML()) { return; }
      let _this = FrameMask, dom1: HTMLDivElement | null;
      if (dom1 = _this.node) {
        _this.more = true;
      } else {
        dom1 = VDom.createElement("div");
        dom1.setAttribute("style", "background:none;border:5px solid yellow;box-shadow:none;\
box-sizing:border-box;display:block;float:none;height:100%;left:0;margin:0;\
opacity:1;pointer-events:none;position:fixed;top:0;width:100%;z-index:2147483647;");
        _this.node = dom1;
        _this.timer = setInterval(_this.Remove, 200);
      }
      dom1.style.borderColor = request.mask === FrameMaskType.OnlySelf ? "lightsalmon" : "yellow";
      VDom.UI.root && isEnabledForUrl ? VDom.UI.addElement(dom1) :
      (document.webkitFullscreenElement || document.documentElement as HTMLElement).appendChild(dom1);
    },
    Remove (this: void): void {
      const _this = FrameMask;
      if (_this.more) {
        _this.more = false;
        return;
      }
      if (_this.node) { _this.node.remove(); _this.node = null; }
      clearInterval(_this.timer);
    }
  },
  HUD = {
    tweenId: 0,
    box: null as HTMLDivElement | null,
    text: "",
    opacity: 0 as 0 | 0.25 | 0.5 | 0.75 | 1,
    enabled: false,
    timer: 0,
    showCopied: function (this: VHUD, text: string, e?: string, virtual?: true): string | void {
      if (!text) {
        if (virtual) { return text; }
        return this.showForDuration(`No ${e || "text"} found!`, 1000);
      }
      if (text.startsWith("chrome-")) {
        text = text.substring(text.indexOf('/', text.indexOf('/') + 2));
      }
      text = `Copied: ${text.length > 41 ? text.substring(0, 39) + "..." : text + "."}`;
      if (virtual) { return text; }
      return this.showForDuration(text, 2000);
    } as VHUD["showCopied"],
    showForDuration (text: string, duration?: number): void {
      this.show(text);
      this.text && ((this as typeof HUD).timer = setTimeout(this.hide, duration || 1500));
    },
    show (text: string): void {
      if (!this.enabled || !VDom.isHTML()) { return; }
      this.opacity = 1; this.text = text;
      if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
      let el = this.box, i = el ? +(el.style.opacity || 1) : 0;
      if (i > 0) {
        ((el as HTMLDivElement).firstChild as Text).data = text;
        if (i === 1) { return; }
      }
      this.tweenId || (this.tweenId = setInterval(this.tween, 40));
      if (el) { return; }
      el = VDom.createElement("div");
      el.className = "R HUD";
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      el.appendChild(document.createTextNode(text));
      VDom.UI.addElement(this.box = el, {adjust: false});
    },
    tween (this: void): void {
      if (!VHUD) { return; }
      const hud = HUD, el = hud.box as HTMLDivElement, st = el.style;
      let opacity = +(st.opacity || 1);
      if (opacity === hud.opacity) {}
      else if (opacity === 0) {
        st.opacity = "0.25";
        st.visibility = "";
        (el.firstChild as Text).data = hud.text;
        return VDom.UI.adjust();
      } else if (document.hasFocus()) {
        opacity += opacity < hud.opacity ? 0.25 : -0.25;
      } else {
        opacity = hud.opacity;
      }
      st.opacity = opacity < 1 ? opacity as number | string as string : "";
      if (opacity !== hud.opacity) { return; }
      if (opacity === 0) {
        st.visibility = "hidden";
        (el.firstChild as Text).data = "";
      }
      clearInterval(hud.tweenId);
      hud.tweenId = 0;
    },
    hide (this: void): void {
      let hud = HUD, i: number;
      if (i = hud.timer) { clearTimeout(i); hud.timer = 0; }
      hud.opacity = 0; hud.text = "";
      if (hud.box && !hud.tweenId && VHUD) {
        hud.tweenId = setInterval(hud.tween, 40);
      }
    }
  },
  requestHandlers: { [K in keyof BgReq]: (this: void, request: BgReq[K]) => void } = {
    init (request): void {
      const r = requestHandlers;
      (VSettings.cache = request.load).onMac && (VKeyboard.correctionMap = Object.create<string>(null));
      r.keyMap(request);
      r.reset(request);
      r.init = null as never;
      return VDom.documentReady(ELs.OnReady);
    },
    reset ({ passKeys: newPassKeys }): void {
      const enabled = (newPassKeys !== ""), old = VSettings.enabled;
      passKeys = (newPassKeys && parsePassKeys(newPassKeys)) as SafeDict<true> | null;
      VSettings.enabled = isEnabledForUrl = enabled;
      if (enabled) {
        if (!old) {
          InsertMode.init();
          ELs.hook(addEventListener);
        }
      } else if (requestHandlers.init) {
        InsertMode.grabFocus = false;
        return ELs.hook(removeEventListener, 1);
      } else {
        Commands.reset();
      }
      if (VDom.UI.box) { return VDom.UI.toggle(enabled); }
    },
    checkIfEnabled: function (this: void): void {
      return vPort.safePost({ handler: "checkIfEnabled", url: window.location.href });
    },
    settingsUpdate (request): void {
      type Keys = keyof SettingsNS.FrontendSettings;
      Object.setPrototypeOf(request, null);
      delete request.name;
      for (let i in request) {
        VSettings.cache[i as Keys] = request[i as Keys] as SettingsNS.FrontendSettings[Keys];
      }
      if ("userDefinedOuterCss" in request) { return ELs.OnReady(true); }
    },
    insertInnerCSS: VDom.UI.InsertInnerCSS,
    focusFrame: FrameMask.Focus,
    exitGrab: InsertMode.ExitGrab as (this: void, request: Req.bg<"exitGrab">) => void,
    keyMap (request): void {
      const map = keyMap = request.keyMap, func = Object.setPrototypeOf;
      func(map, null);
      function iter(obj: ReadonlyChildKeyMap): void {
        func(obj, null);
        for (let key in obj) { if (obj[key] !== 0) {
          iter(obj[key] as ReadonlyChildKeyMap);
        } }
      }
      for (let key in map) {
        let sec = map[key];
        if (sec === 0 || sec === 1) { continue; }
        iter(sec as ReadonlyChildKeyMap);
      }
      (mapKeys = request.mapKeys) && func(mapKeys, null);
    },
    execute (request): void {
      return VUtils.execCommand(Commands, request.command, request.count, request.options);
    },
    createMark: VMarks.CreateGlobalMark,
    scroll: VMarks.Goto,
    showHUD (request): void {
      const a = request.text;
      return request.isCopy ? HUD.showCopied(a) : HUD.showForDuration(a);
    },
  showHelpDialog ({ html, advanced: shouldShowAdvanced, optionUrl}): void {
    let box: HTMLElement, oldShowHelp: typeof Commands.showHelp, hide: (this: void, e?: Event | number | "exitHD") => void
      , node1: HTMLElement;
    if (!VDom.isHTML()) { return; }
    Commands.showHelp("exitHD");
    box = VDom.createElement("div");
    box.className = "R Scroll UI";
    box.id = "HelpDialog";
    box.innerHTML = html;
    hide = function(event: Event): void { event.stopImmediatePropagation(); };
    box.onclick = hide;
    box.addEventListener("mousewheel", hide, {passive: true});

    hide = function(event): void {
      event instanceof Event && event.preventDefault();
      VDom.lastHovered && box.contains(VDom.lastHovered) && (VDom.lastHovered = null);
      VScroller.current && box.contains(VScroller.current) && (VScroller.current = null);
      VHandler.remove(box);
      box.remove();
      Commands.showHelp = oldShowHelp;
    };
    node1 = box.querySelector("#OptionsPage") as HTMLAnchorElement;
    if (! window.location.href.startsWith(optionUrl)) {
      (node1 as HTMLAnchorElement).href = optionUrl;
      node1.onclick = function(event) {
        vPort.post({ handler: "focusOrLaunch", url: optionUrl });
        return hide(event);
      };
    } else {
      node1.remove();
    }
    node1 = box.querySelector("#AdvancedCommands") as HTMLElement;
    function toggleAdvanced(this: void): void {
      (node1.firstChild as Text).data = (shouldShowAdvanced ? "Hide" : "Show") + " advanced commands";
      box.classList.toggle("HelpAdvanced");
    }
    oldShowHelp = Commands.showHelp;
    node1.onclick = function(event) {
      event.preventDefault();
      shouldShowAdvanced = !shouldShowAdvanced;
      toggleAdvanced();
      vPort.post({
        handler: "setSetting",
        key: "showAdvancedCommands",
        value: shouldShowAdvanced
      } as SetSettingReq<"showAdvancedCommands">);
    };
    (box.querySelector("#HClose") as HTMLElement).onclick = Commands.showHelp = hide;
    shouldShowAdvanced && toggleAdvanced();
    VDom.UI.addElement(box, Vomnibar.status ? null : {before: Vomnibar.box});
    document.hasFocus() || setTimeout(function() { window.focus(); }, 0);
    VScroller.current = box;
    VHandler.push(function(event) {
      if (!InsertMode.lock && VKeyboard.isEscape(event)) {
        VDom.UI.removeSelection(VDom.UI.root as ShadowRoot) || hide();
        return HandlerResult.Prevent;
      }
      return HandlerResult.Nothing;
    }, box);
  }
  };

  function parsePassKeys(newPassKeys: string): SafeDict<true> {
    const pass = Object.create<true>(null);
    for (const ch of newPassKeys.split(' ')) {
      pass[ch] = true;
    }
    return pass;
  }

  function checkValidKey(event: KeyboardEvent, key: string): HandlerResult.Nothing | HandlerResult.Prevent {
    key = VKeyboard.getKey(event, key);
    mapKeys !== null && (key = mapKeys[key] || key);
    let j = (nextKeys || keyMap)[key];
    if (nextKeys === null) {
      if (j == null || passKeys !== null && key in passKeys) { return HandlerResult.Nothing; }
    } else if (j == null) {
      j = keyMap[key];
      if (j == null) { return esc(HandlerResult.Nothing); }
      if (j !== 0) { currentKeys = ""; }
    }
    if (j === 0) {
      vPort.post({ handler: "key", key: currentKeys + key });
      return esc(HandlerResult.Prevent);
    } else {
      currentKeys += key; nextKeys = j !== 1 ? j : keyMap;
      return HandlerResult.Prevent;
    }
  }

  VPort = { post: vPort.post, send: vPort.send };
  VHUD = HUD;

  VEventMode = {
    lock (this: void): Element | null { return InsertMode.lock; },
    onWndBlur (this: void, f): void { ELs.OnWndBlur = f; },
    OnWndFocus (this: void): (this: void) => void { return ELs.OnWndFocus; },
    focusAndListen (): void {
      InsertMode.ExitGrab();
      setTimeout(function(): void {
        let old = ELs.OnWndFocus, fail = true;
        ELs.OnWndFocus = function(): void { fail = false; };
        window.focus();
        fail && isEnabledForUrl && ELs.hook(addEventListener);
        return (ELs.OnWndFocus = old)();
      }, 0);
    },
    mapKey (this: void, key): string { return mapKeys !== null && mapKeys[key] || key; },
    exitGrab: InsertMode.ExitGrab,
    scroll (this: void, event, wnd): void {
      if (!event || event.shiftKey || event.altKey) { return; }
      const { keyCode } = event as { keyCode: number }, c = (keyCode & 1) as BOOL;
      if (!(keyCode >= VKeyCodes.pageup && keyCode <= VKeyCodes.down)) { return; }
      wnd && VSettings.cache.smoothScroll && VEventMode.OnScrolls[3](wnd, 1);
      if (keyCode >= VKeyCodes.left) {
        return VScroller.scrollBy((1 - c) as BOOL, keyCode < VKeyCodes.right ? -1 : 1, 0);
      } else if (keyCode > VKeyCodes.pagedown) {
        return VScroller.scrollTo(1, 0, c);
      } else if (!(event.ctrlKey || event.metaKey)) {
        return VScroller.scrollBy(1, 0.5 - c, "viewSize");
      }
    },
    OnScrolls: [function (event): void | 1 {
      if (event.repeat) {
        VUtils.Prevent(event);
        return (VScroller.keyIsDown = VScroller.Core.maxInterval) as 1;
      } else if (this !== VEventMode.OnScrolls) {
        return VEventMode.OnScrolls[3](this);
      } else {
        VScroller.keyIsDown = 0;
      }
    }, function (event): void {
      if (event.isTrusted != false) {
        VUtils.Prevent(event);
        return VEventMode.OnScrolls[3](this);
      }
    }, function (event): void {
      if (event.target === this && event.isTrusted != false) { return VEventMode.OnScrolls[3](this); }
    }, function (this: VEventMode["OnScrolls"], wnd, interval): void {
      const f = interval ? addEventListener : removeEventListener;
      VScroller.keyIsDown = interval || 0;
      f.call(wnd, "keyup", this[1], true); f.call(wnd, "blur", this[2], true);
    }],
    setupSuppress (this: void, onExit): void {
      const mode = InsertMode, f = mode.onExitSuppress;
      mode.onExitSuppress = mode.suppressType = null;
      if (onExit) {
        mode.suppressType = VDom.selType();
        mode.onExitSuppress = onExit;
      }
      if (f) { return f(); }
    },
    suppress (this: void, key?: number): void { key && (KeydownEvents[key] = 1); },
    keydownEvents: function (this: void, arr?: KeydownCacheArray): KeydownCacheArray | boolean {
      if (!arr) { return KeydownEvents; }
      return !isEnabledForUrl && !(KeydownEvents = arr);
    } as VEventMode["keydownEvents"]
  };

  VSettings = {
    enabled: false,
    cache: null as never as VSettings["cache"],
    checkIfEnabled: requestHandlers.checkIfEnabled as VSettings["checkIfEnabled"],
    onDestroy: null,
  destroy: function(silent, keepChrome): void {
    VSettings.enabled = isEnabledForUrl = false;
    ELs.hook(removeEventListener);

    Commands.reset();
    let f: typeof VSettings.onDestroy, ui = VDom.UI;
    (f = VSettings.onDestroy) && f();

    VUtils = VKeyboard = VDom = VDom = VHandler = //
    VHints = Vomnibar = VScroller = VMarks = VFindMode = //
    VSettings = VHUD = VPort = VEventMode = VVisualMode = //
    esc = null as never;
    ui.box && ui.toggle(false);

    silent || console.log("%cVimium++%c in %c%s%c has been destroyed at %o."
      , "color:red", "color:auto", "color:darkred"
      , window.location.pathname.replace(<RegExpOne> /^.*\/([^\/]+)\/?$/, "$1")
      , "color:auto", Date.now());

    if (vPort.port) { try { vPort.port.disconnect(); } catch (e) {} }
    isInjected || location.protocol.startsWith("chrome") || keepChrome || (window.chrome = null as never);
  }
  };

  // here we call it before vPort.connect, so that the code works well even if runtime.connect is sync
  ELs.hook(addEventListener);
  location.href !== "about:blank" || isInjected ? vPort.connect(PortType.initing) :
  (window.onload = function() { window.onload = null as never; setTimeout(function(): void {
    const a = document.body,
    exit = !!a && (a.isContentEditable || a.childElementCount === 1 && (a.firstElementChild as HTMLElement).isContentEditable === true);
    exit ? VSettings.destroy(true) : vPort.port || vPort.connect(PortType.initing);
  }, 18); });
})();
