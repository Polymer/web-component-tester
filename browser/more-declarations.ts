declare namespace Mocha {
  interface UtilsStatic {
    highlightTags(somethingSomething: string): void;
  }
  let utils: UtilsStatic;
  interface IRunner extends NodeJS.EventEmitter {
    name?: string;
    total: number;
  }

  interface IRunnable {
    parent: {};
    root: boolean;
  }

  interface ISuite {
    root: boolean;
  }
}
