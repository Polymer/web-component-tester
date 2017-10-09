import {default as ChildRunner, SharedState} from './childrunner.js';
import {Config} from './config.js';

declare global {
  interface Window {
    __wctUseNpm?: boolean;
    WebComponents?: WebComponentsStatic;
    WCT: {
      _ChildRunner: typeof ChildRunner; share: SharedState; _config: Config;
    };
  }
  interface WebComponentsStatic {
    ready?(): void;
  }
}

export {};
