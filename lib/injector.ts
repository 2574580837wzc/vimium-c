type _EventTargetEx = typeof EventTarget;
interface EventTargetEx extends _EventTargetEx {
  vimiumRemoveHooks: (this: void) => void;
}

(function() {
  const curEl = document.currentScript as HTMLScriptElement, scriptSrc = curEl.src, i = scriptSrc.indexOf("://") + 3,
  extId = scriptSrc.substring(i, scriptSrc.indexOf("/", i));
  let tick = 1, handler: (this: void, res: ExternalMsgs["content_scripts"]["res"] | null | undefined | false) => void;
chrome.runtime.sendMessage(extId, { handler: "content_scripts" } as ExternalMsgs["content_scripts"]["req"],
handler = function(content_scripts) {
  let str: string | undefined, noBackend: boolean;
  if (!content_scripts) {
    type LastError = chrome.runtime.LastError;
    const msg: string | void = (chrome.runtime.lastError as void | LastError) &&
      (chrome.runtime.lastError as void | LastError as LastError).message,
    host = chrome.runtime.id || location.host || location.protocol;
    noBackend = !!(msg && msg.lastIndexOf("not exist") >= 0 && chrome.runtime.id);
    if (content_scripts === false) { // disabled
      str = ": not in the white list.";
    } else if (!noBackend && chrome.runtime.lastError) {
      str = msg ? `:\n\t${msg}` : ": no backend found.";
    } else if (tick > 3) {
      str = msg ? `:\n\t${msg}` : `: retried but failed (${content_scripts}).`;
      noBackend = false;
    } else {
      setTimeout(function() {
        chrome.runtime.sendMessage(extId, { handler: "content_scripts" }, handler);
      }, 200 * tick);
      tick++;
      noBackend = true;
    }
    if (!noBackend) {
      (EventTarget as EventTargetEx).vimiumRemoveHooks && (EventTarget as EventTargetEx).vimiumRemoveHooks();
      console.log("%cVimium++%c: %cfail%c to inject into %c%s%c %s"
        , "color:red", "color:auto", "color:red", "color:auto", "color:#0c85e9"
        , host, "color:auto", str ? str : ` (${tick} retries).`);
    }
  }
  if (window.VimiumInjector && typeof VimiumInjector.destroy === "function") {
    VimiumInjector.destroy(true);
  }

  window.VimiumInjector = {
    id: extId,
    alive: 0,
    destroy: null
  };
  if (!content_scripts) {
    return chrome.runtime.lastError;
  }
  const insertLocation = document.contains(curEl) ? curEl
      : (document.documentElement as HTMLHtmlElement).firstChild as Node
    , parentElement = insertLocation.parentElement as Element;
  for (const i of content_scripts) {
    const scriptElement = document.createElement("script");
    scriptElement.async = false;
    scriptElement.defer = true;
    scriptElement.src = i;
    parentElement.insertBefore(scriptElement, insertLocation).remove();
  }
});
})();

(function(): void {
type ListenerEx = EventTarget["addEventListener"] & { vimiumHooked?: boolean; }

const obj = EventTarget as EventTargetEx, cls = obj.prototype, _listen = cls.addEventListener as ListenerEx;
if (_listen.vimiumHooked === true) { return; }

const HA = HTMLAnchorElement, HF = HTMLFormElement, E = typeof Element === "function" ? Element : HTMLElement;

const newListen = cls.addEventListener = function addEventListener(this: EventTarget, type: string, listener: EventListenerOrEventListenerObject) {
  if (type === "click" && listener && !(this instanceof HA || this instanceof HF) && this instanceof E) {
    (this as Element).vimiumHasOnclick = true;
  }
  const len = arguments.length;
  return len === 2 ? _listen.call(this, type, listener) : len === 3 ? _listen.call(this, type, listener, arguments[2])
    : _listen.apply(this, arguments as any);
};
(cls.addEventListener as ListenerEx).vimiumHooked = true;
obj.vimiumRemoveHooks = function() {
  delete obj.vimiumRemoveHooks;
  cls.addEventListener === newListen && (cls.addEventListener = _listen);
};
})();
