// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

WCT.reporters.Meta = Meta;

/**
 * A Mocha reporter that consumes events from multiple mocha runners, and
 * proxies those events out to child reporters in a sane(-ish) fashion.
 *
 * @param {!Array.<!Mocha.reporters.Base>} childReporters Additional reporters
 *     to proxy events out to.
 * @param {!Mocha.Runner} runner The current document's runner.
 */
function Meta(childReporters, runner) {
  Mocha.reporters.Base.call(this, runner);

  console.log('Meta', childReporters, runner);

  this.childReporters = childReporters.map(function(reporter) {
    return new reporter(runner);
  });

  // runner.on('start', function() {
  //   console.log('start');
  // });
  // runner.on('end', function() {
  //   console.log('end');
  // });
  // runner.on('suite', function(suite) {
  //   console.log('suite', suite);
  // });
  // runner.on('suite end', function(suite) {
  //   console.log('suite end', suite);
  // });
  // runner.on('test', function(test) {
  //   console.log('test', test);
  // });
  // runner.on('test end', function(test) {
  //   console.log('test end', test);
  // });
  // runner.on('hook', function(test) {
  //   console.log('hook', test);
  // });
  // runner.on('hook end', function(test) {
  //   console.log('hook end', test);
  // });
  // runner.on('pass', function(test) {
  //   console.log('pass', test);
  // });
  // runner.on('fail', function(test, error) {
  //   console.log('fail', test, error);
  // });
  // runner.on('pending', function(test) {
  //   console.log('pending', test);
  // });
};
Meta.prototype = Object.create(Mocha.reporters.Base.prototype);

})();
