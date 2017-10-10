import * as SocketIOStatic from 'socket.io';
import * as StackyStatic from 'stacky';

import {default as ChildRunner, SharedState} from './childrunner.js';
import {Config} from './config.js';

declare global {
  interface Window {
    __wctUseNpm?: boolean;
    WebComponents?: WebComponentsStatic;
    WCT: {
      _ChildRunner: typeof ChildRunner; share: SharedState; _config: Config;
    };
    mocha: typeof mocha;
    Mocha: typeof Mocha;
  }
  interface WebComponentsStatic {
    ready?(): void;
  }

  interface Element {
    isConnected?: boolean;
  }

  interface Mocha {
    suite: Mocha.ISuite;
  }

  var Stacky: typeof StackyStatic;

  var io: typeof SocketIOStatic;
}

export {};
