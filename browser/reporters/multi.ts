/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as util from '../util.js';

const STACKY_CONFIG = {
  indent: '  ',
  locationStrip: [
    /^https?:\/\/[^\/]+/,
    /\?.*$/,
  ],
  filter(line: {location: string}) {
    return !!line.location.match(/\/web-component-tester\/[^\/]+(\?.*)?$/);
  },
};

// https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36-46
const MOCHA_EVENTS = [
  'start', 'end', 'suite', 'suite end', 'test', 'test end', 'hook', 'hook end',
  'pass', 'fail', 'pending', 'childRunner end'
];

// Until a suite has loaded, we assume this many tests in it.
const ESTIMATED_TESTS_PER_SUITE = 3;

export interface Reporter {}

export interface ReporterFactory { new(parent: MultiReporter): Reporter; }

interface ExtendedTest extends Mocha.ITest {
  err: any;
}

/**
 * A Mocha-like reporter that combines the output of multiple Mocha suites.
 */
export default class MultiReporter implements Reporter {
  private readonly reporters: ReadonlyArray<Reporter>;
  private readonly parent: MultiReporter|undefined;
  private readonly basePath: string;
  total: number;
  private currentRunner: null|Mocha.IRunner;
  /** Arguments that would be called on emit(). */
  private pendingEvents: Array<any[]>;
  private complete: boolean|undefined;

  /**
   * @param numSuites The number of suites that will be run, in order to
   *     estimate the total number of tests that will be performed.
   * @param reporters The set of reporters that
   *     should receive the unified event stream.
   * @param parent The parent reporter, if present.
   */
  constructor(
      numSuites: number, reporters: ReporterFactory[],
      parent: MultiReporter|undefined) {
    this.reporters = reporters.map((reporter) => {
      return new reporter(this);
    });

    this.parent = parent;
    this.basePath = parent && parent.basePath || util.basePath(window.location);

    this.total = numSuites * ESTIMATED_TESTS_PER_SUITE;
    // Mocha reporters assume a stream of events, so we have to be careful to
    // only report on one runner at a time...
    this.currentRunner = null;
    // ...while we buffer events for any other active runners.
    this.pendingEvents = [];

    this.emit('start');
  }

  /**
   * @param location The location this reporter represents.
   * @return A reporter-like "class" for each child suite
   *     that should be passed to `mocha.run`.
   */
  childReporter(location: Location|string): ReporterFactory {
    const name = this.suiteTitle(location);
    // The reporter is used as a constructor, so we can't depend on `this` being
    // properly bound.
    const self = this;
    return class ChildReporter {
      constructor(runner: Mocha.IRunner) {
        runner.name = window.name;
        self.bindChildRunner(runner);
      }

      static title = window.name;
    };
  }

  /** Must be called once all runners have finished. */
  done() {
    this.complete = true;
    this.flushPendingEvents();
    this.emit('end');
  }

  /**
   * Emit a top level test that is not part of any suite managed by this
   * reporter.
   *
   * Helpful for reporting on global errors, loading issues, etc.
   *
   * @param title The title of the test.
   * @param error An error associated with this test. If falsy, test is
   *     considered to be passing.
   * @param suiteTitle Title for the suite that's wrapping the test.
   * @param estimated If this test was included in the original
   *     estimate of `numSuites`.
   */
  emitOutOfBandTest(
      title: string, error?: any, suiteTitle?: string, estimated?: boolean) {
    util.debug('MultiReporter#emitOutOfBandTest(', arguments, ')');
    const root: Mocha.ISuite = new (Mocha as any).Suite(suiteTitle || '');
    const test: ExtendedTest = new (Mocha as any).Test(title, function() {});
    test.parent = root;
    test.state = error ? 'failed' : 'passed';
    test.err = error;

    if (!estimated) {
      this.total = this.total + ESTIMATED_TESTS_PER_SUITE;
    }

    const runner = {total: 1} as Mocha.IRunner;
    this.proxyEvent('start', runner);
    this.proxyEvent('suite', runner, root);
    this.proxyEvent('test', runner, test);
    if (error) {
      this.proxyEvent('fail', runner, test, error);
    } else {
      this.proxyEvent('pass', runner, test);
    }
    this.proxyEvent('test end', runner, test);
    this.proxyEvent('suite end', runner, root);
    this.proxyEvent('end', runner);
  }

  /**
   * @param {!Location|string} location
   * @return {string}
   */
  suiteTitle(location: Location|string) {
    let path = util.relativeLocation(location, this.basePath);
    path = util.cleanLocation(path);
    return path;
  }

  // Internal Interface

  /** @param {!Mocha.runners.Base} runner The runner to listen to events for. */
  private bindChildRunner(runner: Mocha.IRunner) {
    MOCHA_EVENTS.forEach((eventName) => {
      runner.on(eventName, this.proxyEvent.bind(this, eventName, runner));
    });
  }

  /**
   * Evaluates an event fired by `runner`, proxying it forward or buffering it.
   *
   * @param {string} eventName
   * @param {!Mocha.runners.Base} runner The runner that emitted this event.
   * @param {...*} var_args Any additional data passed as part of the event.
   */
  private proxyEvent(
      eventName: string, runner: Mocha.IRunner, ..._args: any[]) {
    const extraArgs = Array.prototype.slice.call(arguments, 2);
    if (this.complete) {
      console.warn(
          'out of order Mocha event for ' + runner.name + ':', eventName,
          extraArgs);
      return;
    }

    if (this.currentRunner && runner !== this.currentRunner) {
      this.pendingEvents.push(Array.prototype.slice.call(arguments));
      return;
    }
    util.debug('MultiReporter#proxyEvent(', arguments, ')');

    // This appears to be a Mocha bug: Tests failed by passing an error to their
    // done function don't set `err` properly.
    //
    // TODO(nevir): Track down.
    if (eventName === 'fail' && !extraArgs[0].err) {
      extraArgs[0].err = extraArgs[1];
    }

    if (eventName === 'start') {
      this.onRunnerStart(runner);
    } else if (eventName === 'end') {
      this.onRunnerEnd(runner);
    } else {
      this.cleanEvent(eventName, runner, extraArgs);
      this.emit.apply(this, [eventName].concat(extraArgs));
    }
  }

  /**
   * Cleans or modifies an event if needed.
   *
   * @param eventName
   * @param runner The runner that emitted this event.
   * @param extraArgs
   */
  private cleanEvent(
      eventName: string, _runner: Mocha.IRunner, extraArgs: any[]) {
    // Suite hierarchy
    if (extraArgs[0]) {
      extraArgs[0] = this.showRootSuite(extraArgs[0]);
    }

    // Normalize errors
    if (eventName === 'fail') {
      extraArgs[1] = Stacky.normalize(extraArgs[1], STACKY_CONFIG);
    }
    if (extraArgs[0] && extraArgs[0].err) {
      extraArgs[0].err = Stacky.normalize(extraArgs[0].err, STACKY_CONFIG);
    }
  }

  /**
   * We like to show the root suite's title, which requires a little bit of
   * trickery in the suite hierarchy.
   *
   * @param {!Mocha.Runnable} node
   */
  private showRootSuite(node: Mocha.IRunnable) {
    const leaf = node = Object.create(node);
    while (node && node.parent) {
      const wrappedParent = Object.create(node.parent);
      node.parent = wrappedParent;
      node = wrappedParent;
    }
    node.root = false;

    return leaf;
  }

  /** @param {!Mocha.runners.Base} runner */
  private onRunnerStart(runner: Mocha.IRunner) {
    util.debug('MultiReporter#onRunnerStart:', runner.name);
    this.total = this.total - ESTIMATED_TESTS_PER_SUITE + runner.total;
    this.currentRunner = runner;
  }

  /** @param {!Mocha.runners.Base} runner */
  private onRunnerEnd(runner: Mocha.IRunner) {
    util.debug('MultiReporter#onRunnerEnd:', runner.name);
    this.currentRunner = null;
    this.flushPendingEvents();
  }

  /**
   * Flushes any buffered events and runs them through `proxyEvent`. This will
   * loop until all buffered runners are complete, or we have run out of
   * buffered events.
   */
  private flushPendingEvents() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    events.forEach((eventArgs) => {
      this.proxyEvent.apply(this, eventArgs);
    });
  }
}

export default interface MultiReporter extends Mocha.IRunner,
                                               NodeJS.EventEmitter {}
