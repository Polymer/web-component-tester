/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var _      = require('lodash');
var events = require('events');

var CleanKill   = require('./cleankill');
var CliReporter = require('./clireporter');
var config      = require('./config');
var steps       = require('./steps');

module.exports = function test(options, done) {
  options = _.merge(config.defaults(), options);
  var emitter = new events.EventEmitter();

  new CliReporter(emitter, options.output, options);

  // Add plugin event listeners
  _.values(options.plugins).forEach(function(plugin) {
    if (plugin.listener) {
        new plugin.listener(emitter, options.output, plugin);
    }
  });

  var cleanOptions = _.omit(options, 'output');
  emitter.emit('log:debug', 'Configuration:', cleanOptions);

  steps.runTests(options, emitter, function(error) {
    CleanKill.close(done.bind(null, error));
  });
  return emitter;
};
