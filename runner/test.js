/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var events = require('events');

var CleanKill   = require('./cleankill');
var CliReporter = require('./clireporter');
var config      = require('./config');
var steps       = require('./steps');

module.exports = function test(options, done) {
  config.mergeDefaults(options);
  var emitter = new events.EventEmitter();
  new CliReporter(emitter, options.output, options);

  steps.runTests(options, emitter, function(error) {
    CleanKill.close(done.bind(null, error));
  });
  return emitter;
}
