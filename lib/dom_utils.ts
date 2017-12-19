var VDom = {
  UI: null as never as DomUI,
  isHTML (this: void): boolean { return document.documentElement instanceof HTMLElement; },
  createElement: function (this: any, tagName: string): HTMLElement {
    const node = document.createElement(tagName), valid = node instanceof HTMLElement;
    (this as typeof VDom).createElement = valid
      ? document.createElement.bind(document)
      : (document.createElementNS as (namespaceURI: "http://www.w3.org/1999/xhtml", qualifiedName: string) => HTMLElement
        ).bind(document, "http://www.w3.org/1999/xhtml");
    return valid ? node : (this as typeof VDom).createElement(tagName);
  } as Document["createElement"],
  documentReady (callback: (this: void) => void): void {
    const f = function(callback: (this: void) => void): void { return callback(); };
    if (document.readyState !== "loading") {
      this.documentReady = f;
      return callback();
    }
    const listeners = [callback], eventHandler = function(): void {
      // not need to check event.isTrusted
      removeEventListener("DOMContentLoaded", eventHandler, true);
      if (!VDom) { return; }
      VDom.documentReady = f;
      for (const i of listeners) { i(); }
    };
    this.documentReady = function(callback): void {
      listeners.push(callback);
    };
    addEventListener("DOMContentLoaded", eventHandler, true);
  },
  getSelectionText (): string {
    return window.getSelection().toString().trim();
  },
  getParent (el: Element): Element | null {
    const arr = el.getDestinationInsertionPoints ? el.getDestinationInsertionPoints() : null;
    arr && arr.length > 0 && (el = arr[arr.length - 1]);
    return el.parentElement || el.parentNode instanceof ShadowRoot && el.parentNode.host || null;
  },
  prepareCrop (): void {
    let iw: number, ih: number, ihs: number;
    this.prepareCrop = function(): void {
      const doc = document.documentElement as Element;
      iw = Math.max(window.innerWidth - 24, doc.clientWidth);
      ih = Math.max(window.innerHeight - 24, doc.clientHeight);
      ihs = ih - 8;
    };
    VDom.cropRectToVisible = function(left, top, right, bottom): VRect | null {
      if (top > ihs || bottom < 3) {
        return null;
      }
      const cr: VRect = [ //
        left   >  0 ? (left   | 0) :  0, //
        top    >  0 ? (top    | 0) :  0, //
        right  < iw ? (right  | 0) : iw, //
        bottom < ih ? (bottom | 0) : ih  //
      ];
      return (cr[2] - cr[0] >= 3 && cr[3] - cr[1] >= 3) ? cr : null;
    };
    return this.prepareCrop();
  },
  getVisibleClientRect (element: Element, el_style?: CSSStyleDeclaration): VRect | null {
    const arr = element.getClientRects();
    let cr: VRect | null, style: CSSStyleDeclaration | null, _ref: HTMLCollection | undefined
      , isVisible: boolean | undefined, notInline: boolean | undefined, str: string;
    for (let _i = 0, _len = arr.length; _i < _len; _i++) {
      const rect = arr[_i];
      if (rect.width > 0 && rect.height > 0) {
        if (cr = VDom.cropRectToVisible(rect.left, rect.top, rect.right, rect.bottom)) {
          if (isVisible == null) {
            el_style || (el_style = window.getComputedStyle(element));
            isVisible = el_style.visibility === 'visible';
          }
          if (isVisible) { return cr; }
        }
        continue;
      }
      if (_ref) { continue; }
      _ref = element.children;
      for (let _j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        style = window.getComputedStyle(_ref[_j]);
        if (style.float !== 'none' ||
            ((str = style.position) !== 'static' && str !== 'relative')) {}
        else if (rect.height === 0) {
          if (notInline == null) {
            el_style || (el_style = window.getComputedStyle(element));
            notInline = el_style.fontSize !== "0px" || !el_style.display.startsWith("inline");
          }
          if (notInline || !style.display.startsWith("inline")) { continue; }
        } else { continue; }
        if (cr = this.getVisibleClientRect(_ref[_j], style)) { return cr; }
      }
      style = null;
    }
    return null;
  },
  getClientRectsForAreas (element: HTMLImageElement, output: Hint[]): boolean | void {
    let diff: number, x1: number, x2: number, y1: number, y2: number, rect: VRect | null | undefined;
    const cr = element.getClientRects()[0] as ClientRect | undefined;
    if (!cr || cr.height < 3 || cr.width < 3) { return; }
    // replace is necessary: chrome allows "&quot;", and also allows no "#"
    const map = document.querySelector('map[name="' +
      element.useMap.replace(<RegExpOne>/^#/, "").replace(<RegExpG>/"/g, '\\"') + '"]') as HTMLMapElement | null;
    if (!map) { return; }
    const areas = map.getElementsByTagName("area");
    const toInt = (a: string) => (a as string | number as number) | 0;
    for (let _i = 0, _len = areas.length; _i < _len; _i++) {
      const area = areas[_i], coords = area.coords.split(",").map(toInt);
      switch (area.shape.toLowerCase()) {
      case "circle": case "circ":
        x2 = coords[0]; y2 = coords[1]; diff = coords[2] / Math.sqrt(2);
        x1 = x2 - diff; x2 += diff; y1 = y2 - diff; y2 += diff;
        break;
      case "default":
        x1 = 0; y1 = 0; x2 = cr.width; y2 = cr.height;
        break;
      default:
        x1 = coords[0]; y1 = coords[1]; x2 = coords[2]; y2 = coords[3];
        break;
      }
      rect = VDom.cropRectToVisible(x1 + cr.left, y1 + cr.top, x2 + cr.left, y2 + cr.top);
      if (rect) {
        output.push([area, rect, 0, rect]);
      }
    }
    return !!rect;
  },
  specialZoom: false,
  docZoom: 1, // related to physical pixels
  // return: ::min(deviceRatio, 1) * [ docEl.zoom * ... * ] curTopEl (fullscreen / docEl) .zoom
  getZoom (): number {
    let docEl = document.documentElement as Element, ratio = window.devicePixelRatio
      , zoom = +getComputedStyle(docEl).zoom || 1;
    Math.abs(zoom - ratio) < 1e-5 && this.specialZoom && (zoom = 1);
    for (let el: Element | null = document.webkitFullscreenElement; el && el !== docEl; el = this.getParent(el)) {
      zoom *= +getComputedStyle(el).zoom || 1;
    };
    return this.docZoom = Math.round(zoom * Math.min(ratio, 1) * 1000) / 1000;
  },
  bodyZoom: 1,
  getViewBox (): ViewBox {
    let iw = window.innerWidth, ih = window.innerHeight;
    const ratio = window.devicePixelRatio, ratio2 = Math.min(ratio, 1);
    if (document.webkitIsFullScreen) {
      // It's a whole mess if there's nested "contain" styles and nothing can be ensured right
      this.bodyZoom = 1;
      this.docZoom = this.getZoom();
      const zoom = this.docZoom / ratio2;
      return [0, 0, (iw / zoom) | 0, (ih / zoom) | 0, 0];
    }
    const box = document.documentElement as HTMLElement, st = getComputedStyle(box),
    box2 = document.body, st2 = box2 ? getComputedStyle(box2) : st,
    zoom2 = this.bodyZoom = st2 !== st && +st2.zoom || 1,
    // NOTE: if doc.zoom > 1, although document.documentElement.scrollHeight is integer,
    //   its real rect may has a float width, such as 471.333 / 472
    rect = box.getBoundingClientRect();
    let x = -rect.left, y = -rect.top, zoom = +st.zoom || 1;
    Math.abs(zoom - ratio) < 1e-5 && this.specialZoom && (zoom = 1);
    this.docZoom = Math.round(zoom * ratio2 * 1000) / 1000;
    // since BrowserVer.Min$Document$$ScrollingElement
    // here rect.right is not suitable because <html> may be smaller than <body>
    // todo: width: - right border width, / zoom
    const scrolling = document.scrollingElement === box,
    containHasPaint = (<RegExpOne>/content|paint|strict/).test(st.contain as string) ? 1 : 0,
    width = st.overflowX === "hidden" || st2.overflowX === "hidden" ? 0
      : box.scrollWidth  / zoom - Math.ceil((scrolling ? window.scrollX / zoom : x) + rect.width  % 1
          + (containHasPaint && parseFloat(st.borderRightWidth))),
    height = st.overflowY === "hidden" || st2.overflowY === "hidden" ? 0
      : box.scrollHeight / zoom - Math.ceil((scrolling ? window.scrollY / zoom : y) + rect.height % 1
          + (containHasPaint && parseFloat(st.borderBottomWidth)));
    if (st.position !== "static" || containHasPaint) {
      x -= box.clientLeft, y -= box.clientTop;
    } else {
      x += parseFloat(st.marginLeft), y += parseFloat(st.marginTop);
    }
    // note: `Math.abs(y) < 0.01` supports almost all `0.01 * N` (except .01, .26, .51, .76)
    x = Math.abs(x) < 0.01 ? 0 : Math.round(x * 100) / 100;
    y = Math.abs(y) < 0.01 ? 0 : Math.round(y * 100) / 100;
    x /= zoom2, y /= zoom2;
    iw = Math.min(Math.max(width,  box.clientWidth  / zoom, (iw - 24) / zoom), iw / zoom + 64);
    ih = Math.min(Math.max(height, box.clientHeight / zoom, (ih - 24) / zoom), ih / zoom + 20);
    return [Math.ceil(x), Math.ceil(y), iw, ih - 15, iw];
  },
  ensureInView (el: Element, oldY?: number): boolean {
    const rect = el.getBoundingClientRect(), ty = this.NotVisible(null, rect);
    if (!ty) { return true; }
    if (ty === VisibilityType.OutOfView) {
      const t = rect.top, ih = innerHeight, dir = t < 0 ? -1 : t > ih ? 1 : 0, f = oldY != null;
      el.scrollIntoView(dir < 0);
      (dir || f) && window.scrollBy(0, f ? (oldY as number) - window.scrollY : dir * ih / 5);
    }
    return false;
  },
  NotVisible: function (this: void, element: Element | null, rect?: ClientRect): VisibilityType {
    if (!rect) { rect = (element as Element).getBoundingClientRect(); }
    return rect.height < 0.5 || rect.width < 0.5 ? VisibilityType.NoSpace
      : rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth
        ? VisibilityType.OutOfView : VisibilityType.Visible;
  } as {
    (element: Element): VisibilityType;
    (element: null, rect: ClientRect): VisibilityType;
  },
  isInDOM (element: Node, root?: Node): boolean {
    const d = document, f = d.getRootNode;
    if (!root && typeof f === "function") {
      return f.call(element, {composed: true}) === d;
    }
    root || (root = d);
    if (root.contains(element)) { return true; }
    if (element instanceof HTMLFormElement) { return false; }
    let parent: Node | null;
    while (element !== root && (parent = element.parentNode)) {
      element = parent instanceof ShadowRoot ? parent.host : parent;
    }
    return element === root;
  },
  uneditableInputs: <SafeEnum> { __proto__: null as never,
    button: 1, checkbox: 1, color: 1, file: 1, hidden: 1, //
    image: 1, radio: 1, range: 1, reset: 1, submit: 1
  },
  editableTypes: <SafeDict<EditableType>> { __proto__: null as never,
    input: EditableType._input, textarea: EditableType.Editbox,
    keygen: EditableType.Select, select: EditableType.Select,
    embed: EditableType.Embed, object: EditableType.Embed
  },
  /**
   * if true, then `element` is `HTMLElement`
   */
  getEditableType (element: EventTarget): EditableType {
    if (!(element instanceof HTMLElement) || element instanceof HTMLFormElement) { return EditableType.NotEditable; }
    const ty = this.editableTypes[element.nodeName.toLowerCase()];
    return ty !== EditableType._input ? (ty
        || (element.isContentEditable ? EditableType.Editbox : EditableType.NotEditable))
      : ((element as HTMLInputElement).type in this.uneditableInputs) ? EditableType.NotEditable : EditableType.Editbox;
  },
  docSelectable: true,
  selType (sel?: Selection): SelectionType {
    sel || (sel = window.getSelection());
    return sel.type as SelectionType;
  },
  isSelected (element: Element): boolean {
    const sel = window.getSelection(), node = sel.anchorNode;
    return (element as HTMLElement).isContentEditable === true ? node ? node.contains(element) : false
      : this.selType(sel) === "Range" && sel.isCollapsed && element === (node as Node).childNodes[sel.anchorOffset];
  },
  getSelectionFocusElement (): Element | null {
    let sel = window.getSelection(), node = sel.focusNode, i = sel.focusOffset;
    node && node === sel.anchorNode && i === sel.anchorOffset && (node = node.childNodes[i]);
    return node && node.nodeType !== /* Node.ELEMENT_NODE */ 1 ? node.parentElement : node as (Element | null);
  },
  getElementWithFocus: function(sel: Selection, di: BOOL): Element | null {
    let r = sel.getRangeAt(0);
    this.selType(sel) === "Range" && (r = r.cloneRange()).collapse(!di);
    let el: Node | null = r.startContainer, o: Node | null;
    el.nodeType === /* Node.ELEMENT_NODE */ 1 && (el = (el.childNodes[r.startOffset] || null) as Node | null);
    for (o = el; o && o.nodeType !== /* Node.ELEMENT_NODE */ 1; o = o.previousSibling) {}
    return (o as Element | null) || (el && el.parentElement);
  },
  mouse: function (this: any, element, type, modifiers, related): boolean {
    const mouseEvent = document.createEvent("MouseEvents");
    modifiers || (modifiers = (this as typeof VDom).defaultMouseKeys);
    mouseEvent.initMouseEvent(type, true, true, window, 1, 0, 0, 0, 0
      , modifiers.ctrlKey, modifiers.altKey, modifiers.shiftKey, modifiers.metaKey
      , 0, related || null);
    return element.dispatchEvent(mouseEvent);
  } as VDomMouse,
  defaultMouseKeys: { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false } as EventControlKeys,
  lastHovered: null as Element | null,
  hover (newEl: Element | null, modifiers?: EventControlKeys | null): void {
    let last = this.lastHovered;
    if (last && this.isInDOM(last)) {
      this.mouse(last, "mouseout", modifiers, newEl !== last ? newEl : null);
    } else {
      last = null;
    }
    this.lastHovered = newEl;
    newEl && this.mouse(newEl, "mouseover", modifiers, last);
  },
  isContaining (a: VRect, b: VRect): boolean {
    return a[3] >= b[3] && a[2] >= b[2] && a[1] <= b[1] && a[0] <= b[0];
  },
  fromClientRect (rect: ClientRect): VRect {
    return [rect.left | 0, rect.top | 0, rect.right | 0, rect.bottom | 0];
  },
  setBoundary (style: CSSStyleDeclaration, r: VRect, allow_abs?: boolean): void {
    if (allow_abs && (r[1] < 0 || r[0] < 0 || r[3] > window.innerHeight || r[2] > window.innerWidth)) {
      const arr = this.getViewBox();
      r[0] += arr[0], r[2] += arr[0], r[1] += arr[1], r[3] += arr[1];
      style.position = "absolute";
    }
    style.left = r[0] + "px", style.top = r[1] + "px";
    style.width = (r[2] - r[0]) + "px", style.height = (r[3] - r[1]) + "px";
  },
  cropRectToVisible: null as never as (left: number, top: number, right: number, bottom: number) => VRect | null,
  testCrop (b: VRect): boolean { return b[2] - b[0] >= 3 && b[3] - b[1] >= 3; },
  SubtractSequence (this: [VRect[], VRect], rect1: VRect): void { // rect1 - rect2
    let rect2 = this[1], a = this[0], x1: number, x2: number
      , y1 = Math.max(rect1[1], rect2[1]), y2 = Math.min(rect1[3], rect2[3]);
    if (y1 >= y2 || ((x1 = Math.max(rect1[0], rect2[0])) >= (x2 = Math.min(rect1[2], rect2[2])))) {
      a.push(rect1);
      return;
    }
    // 1 2 3
    // 4   5
    // 6 7 8
    const x0 = rect1[0], x3 = rect1[2], y0 = rect1[1], y3 = rect1[3];
    x0 < x1 && a.push([x0, y0, x1, y3]); // (1)4(6)
    y0 < y1 && a.push([x1, y0, x3, y1]); // 2(3)
    y2 < y3 && a.push([x1, y2, x3, y3]); // 7(8)
    x2 < x3 && a.push([x2, y1, x3, y2]); // 5
  }
};
