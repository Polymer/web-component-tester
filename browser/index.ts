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
/**
 * This file is the entry point into `web-component-tester`'s browser client.
 */
// Registers a bunch of globals:
import './environment/helpers.js';

import ChildRunner from './childrunner.js';
import CLISocket from './clisocket.js';
import * as config from './config.js';
import * as environment from './environment.js';
import * as errors from './environment/errors.js';
import * as mocha from './mocha.js';
import * as reporters from './reporters.js';
import MultiReporter from './reporters/multi.js';
import * as suites from './suites.js';
import * as util from './util.js';

// You can configure WCT before it has loaded by assigning your custom
// configuration to the global `WCT`.
config.setup(window.WCT as any as config.Config);

// Maybe some day we'll expose WCT as a module to whatever module registry you
// are using (aka the UMD approach), or as an es6 module.
const WCT = window.WCT = {
  // A generic place to hang data about the current suite. This object is
  // reported
  // back via the `sub-suite-start` and `sub-suite-end` events.
  share: {},
  // Until then, we get to rely on it to expose parent runners to their
  // children.
  _ChildRunner: ChildRunner,
  _reporter: undefined as any,  // assigned below
  _config: config._config,

  // Public API

  /**
   * Loads suites of tests, supporting both `.js` and `.html` files.
   *
   * @param {!Array.<string>} files The files to load.
   */
  loadSuites: suites.loadSuites,
};

// Load Process

errors.listenForErrors();
mocha.stubInterfaces();
environment.loadSync();

// Give any scripts on the page a chance to declare tests and muck with things.
document.addEventListener('DOMContentLoaded', function() {
  util.debug('DOMContentLoaded');

  environment.ensureDependenciesPresent();

  // We need the socket built prior to building its reporter.
  CLISocket.init(function(error, socket) {
    if (error)
      throw error;

    // Are we a child of another run?
    const current = ChildRunner.current();
    const parent = current && current.parentScope.WCT._reporter;
    util.debug('parentReporter:', parent);

    const childSuites = suites.activeChildSuites();
    const reportersToUse = reporters.determineReporters(socket, parent);
    // +1 for any local tests.
    const reporter =
        new MultiReporter(childSuites.length + 1, reportersToUse, parent);
    WCT._reporter = reporter;  // For environment/compatibility.js

    // We need the reporter so that we can report errors during load.
    suites.loadJsSuites(reporter, function(error) {
      // Let our parent know that we're about to start the tests.
      if (current)
        current.ready(error);
      if (error)
        throw error;

      // Emit any errors we've encountered up til now
      errors.globalErrors.forEach(function onError(error) {
        reporter.emitOutOfBandTest('Test Suite Initialization', error);
      });

      suites.runSuites(reporter, childSuites, function(error) {
        // Make sure to let our parent know that we're done.
        if (current)
          current.done();
        if (error)
          throw error;
      });
    });
  });
});
