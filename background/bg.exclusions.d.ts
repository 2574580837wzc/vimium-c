/// <reference path="../background/bg.d.ts" />

declare namespace ExclusionsNS {
  interface Tester {
    (this: void, url: string): boolean;
  }
  type TesterDict = SafeDict<ExclusionsNS.Tester>;
  type Rules = Array<Tester | string>;

  interface ExclusionsCls extends WeakRefObject {
    testers: SafeDict<Tester> | null;
    getRe (pattern: string): Tester;
    _startsWith(this: string, url: string): boolean;
    _listening: boolean;
    _listeningHash: boolean;
    onlyFirstMatch: boolean;
    rules: Rules;
    setRules (newRules: StoredRule[]): void;
    GetPattern (this: void, url: string): string | null;
    getOnURLChange (): null | Listener;
    format (rules: StoredRule[]): Rules;
    getTemp (this: ExclusionsNS.ExclusionsCls, url: string, rules: StoredRule[]): string | null;
    RefreshStatus (this: void, old_is_empty: boolean): void;
  }
}
