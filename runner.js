/*
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var CleanKill   = require('./runner/cleankill');
var CliReporter = require('./runner/clireporter');
var config      = require('./runner/config');
var gulp        = require('./runner/gulp');
var steps       = require('./runner/steps');

function test(options, done) {
  config.mergeDefaults(options);
  var emitter = new events.EventEmitter();
  new CliReporter(emitter, options.output, options);

  steps.runTests(options, emitter, endRun(emitter, false, done));
  return emitter;
}

// Exports

module.exports = {
  config:   config,
  gulp:     gulp,
  initGulp: gulp.init,  /* TODO(nevir): deprecate */
  steps:    steps,
  test:     test,
};
