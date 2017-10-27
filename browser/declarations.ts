import * as ChaiStatic from 'chai';
import * as SinonStatic from 'sinon';
import * as SocketIOStatic from 'socket.io';
import * as StackyStatic from 'stacky';

import {default as ChildRunner, SharedState} from './childrunner.js';
import {Config} from './config.js';
import MultiReporter from './reporters/multi.js';
import * as suites from './suites.js';

type loadSuitesType = (typeof suites.loadSuites);

declare global {
  interface Window {
    __wctUseNpm?: boolean;
    WebComponents?: WebComponentsStatic;
    Platform?: PlatformStatic;
    Polymer?: PolymerStatic;
    WCT: {
      readonly _ChildRunner: typeof ChildRunner; //
      readonly share: SharedState; //
      readonly _config: Config; //
      readonly loadSuites: loadSuitesType;
      _reporter: MultiReporter;
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
  interface PolymerElement {
    _stampTemplate?(): void;
  }
  interface PolymerElementConstructor {
    prototype: PolymerElement;
  }
  interface PolymerStatic {
    flush(): void;
    dom: {flush(): void};
    Element: PolymerElementConstructor;
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
  var sinon: typeof SinonStatic;
}
