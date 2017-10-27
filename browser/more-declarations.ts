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
    parent: ISuite;
    root: boolean;
    state: 'passed'|'failed'|undefined;
    pending: boolean;
  }

  interface ISuite {
    root: boolean;
  }

  let Runner: {prototype: IRunner; immediately(callback: () => void): void};
}

declare namespace SocketIO {
  interface Server {
    off(): void;
  }
}
