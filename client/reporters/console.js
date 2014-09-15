// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

WCT.ConsoleReporter = ConsoleReporter;

/**
 * A Mocha reporter that logs results out to the web `console`.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function ConsoleReporter(runner) {
  Mocha.reporters.Base.call(this, runner);
  this.titleReporter = new WCT.TitleReporter(runner);

  runner.on('suite', function(suite) {
    if (suite.root) return;
    console.group(suite.title);
  }.bind(this));

  runner.on('suite end', function(suite) {
    if (suite.root) return;
    console.groupEnd();
  }.bind(this));

  runner.on('test', function(test) {
    console.group(test.title);
  }.bind(this));

  runner.on('pending', function(test) {
    console.group(test.title);
    console.warn('pending');
  }.bind(this));

  runner.on('fail', function(test, error) {
    if (console.exception) {
      console.exception(error);
    } else {
      console.error(error.stack);
    }
  }.bind(this));

  runner.on('test end', function(test) {
    console.groupEnd();
  }.bind(this));

  runner.on('end', this.logSummary.bind(this));
};
ConsoleReporter.prototype = Object.create(Mocha.reporters.Base.prototype);

/** Prints out a final summary of test results. */
ConsoleReporter.prototype.logSummary = function logSummary() {
  console.group('Test Results');
    if (this.stats.failures > 0) {
    console.error(WCT.Util.pluralizedStat(this.stats.failures, 'failing'));
  }
  if (this.stats.pending > 0) {
    console.warn('%c' + WCT.Util.pluralizedStat(this.stats.pending, 'pending'), 'color: #e65100');
  }
  console.log(WCT.Util.pluralizedStat(this.stats.passes, 'passing'))

  if (!this.stats.failures && !this.stats.pending) {
    console.log('%call tests passed', 'color: #259b24');
  }
  console.log('Evaluated', this.stats.tests, 'tests in', this.stats.duration + 'ms.');
  console.groupEnd();
};

})();
