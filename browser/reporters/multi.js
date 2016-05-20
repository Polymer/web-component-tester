/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as util from '../util.js';

var STACKY_CONFIG = {
  indent: '  ',
  locationStrip: [
    /^https?:\/\/[^\/]+/,
    /\?.*$/,
  ],
  filter: function(line) {
    return line.location.match(/\/web-component-tester\/[^\/]+(\?.*)?$/);
  },
};

// https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36-46
var MOCHA_EVENTS = [
  'start',
  'end',
  'suite',
  'suite end',
  'test',
  'test end',
  'hook',
  'hook end',
  'pass',
  'fail',
  'pending',
  'childRunner end'
];

// Until a suite has loaded, we assume this many tests in it.
var ESTIMATED_TESTS_PER_SUITE = 3;

/**
 * A Mocha-like reporter that combines the output of multiple Mocha suites.
 *
 * @param {number} numSuites The number of suites that will be run, in order to
 *     estimate the total number of tests that will be performed.
 * @param {!Array.<!Mocha.reporters.Base>} reporters The set of reporters that
 *     should receive the unified event stream.
 * @param {MultiReporter} parent The parent reporter, if present.
 */
export default function MultiReporter(numSuites, reporters, parent) {
  this.reporters = reporters.map(function(reporter) {
    return new reporter(this);
  }.bind(this));

  this.parent = parent;
  this.basePath = parent && parent.basePath || util.basePath(window.location);

  this.total = numSuites * ESTIMATED_TESTS_PER_SUITE;
  // Mocha reporters assume a stream of events, so we have to be careful to only
  // report on one runner at a time...
  this.currentRunner = null;
  // ...while we buffer events for any other active runners.
  this.pendingEvents = [];

  this.emit('start');
}

/**
 * @param {!Location|string} location The location this reporter represents.
 * @return {!Mocha.reporters.Base} A reporter-like "class" for each child suite
 *     that should be passed to `mocha.run`.
 */
MultiReporter.prototype.childReporter = function childReporter(location) {
  var name = this.suiteTitle(location);
  // The reporter is used as a constructor, so we can't depend on `this` being
  // properly bound.
  var self = this;
  function reporter(runner) {
    runner.name = name;
    self.bindChildRunner(runner);
  }
  reporter.title = name;
  return reporter;
};

/** Must be called once all runners have finished. */
MultiReporter.prototype.done = function done() {
  this.complete = true;
  this.flushPendingEvents();
  this.emit('end');
};

/**
 * Emit a top level test that is not part of any suite managed by this reporter.
 *
 * Helpful for reporting on global errors, loading issues, etc.
 *
 * @param {string} title The title of the test.
 * @param {*} opt_error An error associated with this test. If falsy, test is
 *     considered to be passing.
 * @param {string} opt_suiteTitle Title for the suite that's wrapping the test.
 * @param {?boolean} opt_estimated If this test was included in the original
 *     estimate of `numSuites`.
 */
MultiReporter.prototype.emitOutOfBandTest = function emitOutOfBandTest(title, opt_error, opt_suiteTitle, opt_estimated) {
  util.debug('MultiReporter#emitOutOfBandTest(', arguments, ')');
  var root = new Mocha.Suite();
  root.title = opt_suiteTitle || '';
  var test = new Mocha.Test(title, function() {
  });
  test.parent = root;
  test.state  = opt_error ? 'failed' : 'passed';
  test.err    = opt_error;

  if (!opt_estimated) {
    this.total = this.total + ESTIMATED_TESTS_PER_SUITE;
  }

  var runner = {total: 1};
  this.proxyEvent('start', runner);
  this.proxyEvent('suite', runner, root);
  this.proxyEvent('test', runner, test);
  if (opt_error) {
    this.proxyEvent('fail', runner, test, opt_error);
  } else {
    this.proxyEvent('pass', runner, test);
  }
  this.proxyEvent('test end', runner, test);
  this.proxyEvent('suite end', runner, root);
  this.proxyEvent('end', runner);
};

/**
 * @param {!Location|string} location
 * @return {string}
 */
MultiReporter.prototype.suiteTitle = function suiteTitle(location) {
  var path = util.relativeLocation(location, this.basePath);
  path = util.cleanLocation(path);
  return path;
};

// Internal Interface

/** @param {!Mocha.runners.Base} runner The runner to listen to events for. */
MultiReporter.prototype.bindChildRunner = function bindChildRunner(runner) {
  MOCHA_EVENTS.forEach(function(eventName) {
    runner.on(eventName, this.proxyEvent.bind(this, eventName, runner));
  }.bind(this));
};

/**
 * Evaluates an event fired by `runner`, proxying it forward or buffering it.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {...*} var_args Any additional data passed as part of the event.
 */
MultiReporter.prototype.proxyEvent = function proxyEvent(eventName, runner, var_args) {
  var extraArgs = Array.prototype.slice.call(arguments, 2);
  if (this.complete) {
    console.warn('out of order Mocha event for ' + runner.name + ':', eventName, extraArgs);
    return;
  }

  if (this.currentRunner && runner !== this.currentRunner) {
    this.pendingEvents.push(arguments);
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
};

/**
 * Cleans or modifies an event if needed.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {!Array.<*>} extraArgs
 */
MultiReporter.prototype.cleanEvent = function cleanEvent(eventName, runner, extraArgs) {
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
};

/**
 * We like to show the root suite's title, which requires a little bit of
 * trickery in the suite hierarchy.
 *
 * @param {!Mocha.Runnable} node
 */
MultiReporter.prototype.showRootSuite = function showRootSuite(node) {
  var leaf = node = Object.create(node);
  while (node && node.parent) {
    var wrappedParent = Object.create(node.parent);
    node.parent = wrappedParent;
    node = wrappedParent;
  }
  node.root = false;

  return leaf;
};

/** @param {!Mocha.runners.Base} runner */
MultiReporter.prototype.onRunnerStart = function onRunnerStart(runner) {
  util.debug('MultiReporter#onRunnerStart:', runner.name);
  this.total = this.total - ESTIMATED_TESTS_PER_SUITE + runner.total;
  this.currentRunner = runner;
};

/** @param {!Mocha.runners.Base} runner */
MultiReporter.prototype.onRunnerEnd = function onRunnerEnd(runner) {
  util.debug('MultiReporter#onRunnerEnd:', runner.name);
  this.currentRunner = null;
  this.flushPendingEvents();
};

/**
 * Flushes any buffered events and runs them through `proxyEvent`. This will
 * loop until all buffered runners are complete, or we have run out of buffered
 * events.
 */
MultiReporter.prototype.flushPendingEvents = function flushPendingEvents() {
  var events = this.pendingEvents;
  this.pendingEvents = [];
  events.forEach(function(eventArgs) {
    this.proxyEvent.apply(this, eventArgs);
  }.bind(this));
};
