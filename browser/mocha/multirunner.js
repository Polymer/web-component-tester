// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

var MOCHA_EVENTS = ['start', 'end', 'suite', 'suite end', 'test', 'test end', 'hook', 'hook end', 'pass', 'fail', 'pending'];

WCT.MultiRunner = MultiRunner;

/**
 *
 */
function MultiRunner(numSuites, reporters) {
  this.reporters = reporters.map(function(reporter) {
    return new reporter(this);
  }.bind(this));

  this.numSuites     = numSuites;
  this.numSuitesDone = 0;
  // We should have at least this many tests...
  this.total = numSuites;
  // We only allow one runner to be reported on at a time.
  this.currentRunner = null;
  this.pendingEvents = [];

  this.emit('start');
}
// Mocha doesn't expose its `EventEmitter` shim directly, so:
MultiRunner.prototype = Object.create(Object.getPrototypeOf(Mocha.Runner.prototype));

/**
 *
 */
MultiRunner.prototype.childReporter = function childReporter() {
  // The reporter is used as a constructor, so we can't depend on `this` being
  // properly bound.
  var self = this;
  return function childReporter(runner) {
    self.bindChildRunner(runner);
  };
};

/**
 *
 */
MultiRunner.prototype.bindChildRunner = function bindChildRunner(runner) {
  MOCHA_EVENTS.forEach(function(eventName) {
    runner.on(eventName, this.proxyEvent.bind(this, eventName, runner));
  }.bind(this));
};

/**
 *
 */
MultiRunner.prototype.proxyEvent = function proxyEvent(eventName, runner) {
  if (this.currentRunner && runner !== this.currentRunner) {
    this.pendingEvents.push(arguments);
    return;
  }

  if (eventName === 'start') {
    this.onRunnerStart(runner);
  } else if (eventName === 'end') {
    this.onRunnerEnd(runner);
  } else {
    this.emit.apply(this, [eventName].concat(Array.prototype.slice.call(arguments, 2)));
  }
};

/**
 *
 */
MultiRunner.prototype.onRunnerStart = function onRunnerStart(runner) {
  this.currentRunner = runner;
  this.total = this.total - 1 + runner.total;
};

/**
 *
 */
MultiRunner.prototype.onRunnerEnd = function onRunnerEnd(runner) {
  this.currentRunner = null;
  this.flushPendingEvents();

  this.numSuitesDone = this.numSuitesDone + 1;
  if ('numSuites' in this && this.numSuitesDone == this.numSuites) {
    this.emit('end');
  }
};

/**
 *
 */
MultiRunner.prototype.flushPendingEvents = function flushPendingEvents() {
  var events = this.pendingEvents;
  this.pendingEvents = [];
  events.forEach(function(eventArgs) {
    this.proxyEvent.apply(this, eventArgs);
  }.bind(this));
};

})();
