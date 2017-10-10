import * as ChaiStatic from 'chai';
import * as SocketIOStatic from 'socket.io';
import * as StackyStatic from 'stacky';

import {default as ChildRunner, SharedState} from './childrunner.js';
import {Config} from './config.js';

declare global {
  interface Window {
    __wctUseNpm?: boolean;
    WebComponents?: WebComponentsStatic;
    Platform?: PlatformStatic;
    Polymer?: PolymerStatic;
    WCT: {
      _ChildRunner: typeof ChildRunner; share: SharedState; _config: Config;
    };
    mocha: typeof mocha;
    Mocha: typeof Mocha;
    __generatedByWct?: boolean;

    chai: typeof ChaiStatic;
    assert: typeof ChaiStatic.assert;
    expect: typeof ChaiStatic.expect;
  }
  interface WebComponentsStatic {
    ready?(): void;
    flush?(): void;
  }
  interface PlatformStatic {
    performMicrotaskCheckpoint(): void;
  }
  interface PolymerStatic {
    flush(): void;
    dom: {flush(): void};
  }

  interface Element {
    isConnected?: boolean;
  }

  interface Mocha {
    suite: Mocha.ISuite;
  }

  var Stacky: typeof StackyStatic;
  var io: typeof SocketIOStatic;
  var Platform: PlatformStatic;
}
