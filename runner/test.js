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

/**
 * Runs a suite of web component tests.
 *
 * The returned EventEmitter fires various events to allow you to track the
 * progress of the tests:
 *
 * Lifecycle Events:
 *
 * `run-start`
 *   WCT is ready to begin spinning up browsers.
 *
 * `browser-init` {browser} {stats}
 *   WCT is ready to begin spinning up browsers.
 *
 * `browser-start` {browser} {metadata} {stats}
 *   The browser has begun running tests. May fire multiple times (i.e. when
 *   manually refreshing the tests).
 *
 * `sub-suite-start` {browser} {sharedState} {stats}
 *   A suite file has begun running.
 *
 * `test-start` {browser} {test} {stats}
 *   A test has begun.
 *
 * `test-end` {browser} {test} {stats}
 *  A test has ended.
 *
 * `sub-suite-end` {browser} {sharedState} {stats}
 *   A suite file has finished running all of its tests.
 *
 * `browser-end` {browser} {error} {stats}
 *   The browser has completed, and it shutting down.
 *
 * `run-end` {error}
 *   WCT has run all browsers, and is shutting down.
 *
 * Generic Events:
 *
 *  * log:debug
 *  * log:info
 *  * log:warn
 *  * log:error
 *
 * @param {!Object} options The configuration, as specified in ./config.js.
 * @param {function(*)} done callback indicating error or success.
 * @return {!events.EventEmitter}
 */
module.exports = function test(options, done) {
  var emitter = new events.EventEmitter();

  // All of our internal entry points already have defaults merged, but we also
  // want to expose this as the public API to web-component-tester.
  options = _.merge(config.defaults(), options);
  config.expand(options, process.cwd(), function(error, options) {
    if (error) return done(error);

    if (options.output) {
      new CliReporter(emitter, options.output, options);
    }
    var cleanOptions = _.omit(options, 'output');
    emitter.emit('log:debug', 'Configuration:', cleanOptions);

    // Add plugin event listeners
    _.values(options.plugins).forEach(function(plugin) {
      if (plugin.listener) {
        new plugin.listener(emitter, options.output, plugin);
      }
    });

    steps.runTests(options, emitter, function(error) {
      if (options.skipCleanup) {
        done(error);
      } else {
        CleanKill.close(done.bind(null, error));
      }
    });
  });

  return emitter;
};
