interface BaseExecute<T> {
  command: string;
  count: number;
  options: T | null;
}

interface BgReq {
  scroll: {
    name: "scroll";
    markName?: string | undefined;
    scroll: MarksNS.ScrollInfo;
  };
  reset: {
    passKeys: string | null;
    forced?: true;
  };
  insertInnerCSS: {
    name: "insertInnerCSS";
    css: string;
  };
  createMark: {
    name: "createMark";
    markName: string;
  };
  keyMap: {
    mapKeys: SafeDict<string> | null;
    keyMap: KeyMap;
  };
  showHUD: {
    name: "showHUD";
    text: string;
    isCopy?: boolean;
  };
  focusFrame: {
    name: "focusFrame";
    mask: FrameMaskType;
    lastKey?: number;
  };
  execute: BaseExecute<object> & {
    name: "execute";
  };
  exitGrab: {
    name: "exitGrab";
  };
  showHelpDialog: {
    html: string;
    optionUrl: string;
    advanced: boolean;
  };
  init: {
    name: "init",
    load: SettingsNS.FrontendSettingCache,
    passKeys: string | null;
    mapKeys: SafeDict<string> | null,
    keyMap: KeyMap
  };
  settingsUpdate: {
    name: "settingsUpdate",
  } & {
    [key in keyof SettingsNS.FrontendSettings]?: SettingsNS.FrontendSettings[key];
  };
  url: {
    url?: string;
  } & Req.baseFg<keyof FgReq>;
}

interface BgVomnibarReq {
  omni: {
    list: CompletersNS.Suggestion[];
    autoSelect: boolean;
    matchType: CompletersNS.MatchType;
  };
  returnFocus: {
    lastKey: number;
  };
  secret: {
    secret: number;
    browserVersion: BrowserVer;
  };
}
interface FullBgReq extends BgReq, BgVomnibarReq {
}

interface CmdOptions {
  "Vomnibar.activate": {
    vomnibar: string;
    vomnibar2: string | null;
    ptype: VomnibarNS.PageType;
    script: string;
    secret: number;
  };
  goNext: {
    dir: string;
    patterns: string[];
  };
  enterInsertMode: {
    code: number;
    stat: number;
    passExitKey: boolean;
    hud: boolean;
  };
  showHelp: {};
  reload: { url: string, force?: undefined } | { force: boolean, url?: undefined };
  "Find.activate": {
    browserVersion: number;
    count: number;
    dir: 1 | -1;
    query: string | null;
  };
  autoCopy: {
    url: boolean; decoded: boolean;
  };
}

interface FgReq {
  findQuery: {
    query: string;
    index?: undefined;
  } | {
    query?: undefined;
    index: number;
  } | {
    query?: undefined;
    index?: undefined;
  };
  parseUpperUrl: {
    url: string;
    upper: number;
    trailing_slash: boolean | null;
    execute?: true;
  };
  parseSearchUrl: {
    url: string;
    upper?: undefined;
  } | FgReq["parseUpperUrl"];
  searchAs: {
    url: string;
    search: string;
  };
  gotoSession: {
    sessionId: string | number;
    /** default to true  */
    active?: boolean;
  };
  openUrl: {
    url: string;
    keyword?: string | null;
    incognito?: boolean;
    https?: boolean | null;
    reuse?: ReuseType;
  };
  execInChild: {
    url: string;
  } & BaseExecute<object>;
  frameFocused: Req.baseFg<"frameFocused">;
  checkIfEnabled: {
    url: string;
  };
  nextFrame: Req.baseFg<"nextFrame">;
  exitGrab: Req.baseFg<"exitGrab">;
  refocusCurrent: {
    lastKey: number;
  };
  initHelp: {
    unbound?: boolean;
    wantTop?: boolean;
    names?: boolean;
    title?: string;
  };
  initInnerCSS: Req.baseFg<"initInnerCSS">;
  activateVomnibar: ({
    count: number;
    redo?: undefined;
  } | {
    count?: never;
    redo: boolean;
  }) & {
    inner?: boolean;
  };
  omni: {
    query: string;
  } & CompletersNS.Options;
  openCopiedUrl: {
    keyword: string | null;
  };
  copyToClipboard: {
    data: string;
  };
  key: {
    handler: "key";
    key: string;
  };
  blank: {},
  createMark: MarksNS.BaseMark | MarksNS.Mark;
  gotoMark: MarksNS.FgQuery;
  /** 
   * .url is guaranteed to be well formatted by frontend
   */
  focusOrLaunch: MarksNS.FocusOrLaunch;
}

interface FgRes {
  findQuery: string;
  parseSearchUrl: {
    keyword: string;
    start: number;
    url: string;
  } | null;
  parseUpperUrl: {
    url: string;
    path: string | null;
  };
  searchAs: string;
  initInnerCSS: string;
  openCopiedUrl: string;
  gotoMark: boolean;
  copyToClipboard: void;
}

declare namespace Req {
  type bg<K extends keyof FullBgReq> = FullBgReq[K] & {
    name: K;
  };
  type baseFg<K extends string> = {
    handler: K;
  }
  type fg<K extends keyof FgReq> = FgReq[K] & baseFg<K>;

  type baseFgWithRes<K extends string> = {
    readonly _msgId: number;
    readonly request: baseFg<K>;
  }

  interface fgWithRes<K extends keyof FgRes> extends baseFgWithRes<K> {
    readonly _msgId: number;
    readonly request: fg<K>;
  }
  interface res<K extends keyof FgRes> {
    readonly _msgId: number;
    readonly response: FgRes[K];
  }

  interface FgCmd<O extends keyof CmdOptions> extends BaseExecute<CmdOptions[O]> {
    name: "execute";
  }
}

interface SetSettingReq<T extends keyof SettingsNS.FrontUpdateAllowedSettings> {
  handler: "setSetting";
  key: T;
  value: SettingsNS.FrontUpdateAllowedSettings[T];
}

interface ExternalMsgs {
  content_scripts: {
    req: {
      handler: "content_scripts";
    };
    res: string[];
  };
  command: {
    req: {
      handler: "command";
      command: string;
      options?: object | null;
      count?: number;
    };
    res: void;
  };
}
