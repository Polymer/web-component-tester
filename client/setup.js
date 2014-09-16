// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

/** @return {!Object} The default options used within `runSuites`. */
function defaultOptions() {
  return {
    // Options passed directly to Mocha.
    mocha: {
      ui:      'tdd',
      reporter: WCT.HTMLReporter,
    },
    // Whether we should wait for web component frameworks to load before running
    // any tests.
    //
    // Note that this only applies suites of **only** `.js` tests. There is no
    // way for us to guarantee that tests within `.html` documents will be run
    // prior to framework load.
    waitForFrameworks: true,
  };
}

/**
 * Load and run a set of Mocha suites. This is the entry point you're looking
 * for.
 *
 * @param {!Array.<string>} tests An array of test files to load. They can be
 *     either `.js` or `.html` files.
 */
WCT.runSuites = function(files) {
  // TODO(nevir): Configurable
  var options = defaultOptions();
  mocha.setup(options.mocha);

  var steps = [];

  // Set up the socket w/ the CLI runner, as needed.
  var socket;
  steps.push(function(callback) {
    WCT.CLISocket.init(function(error, innerSocket) {
      socket = innerSocket;
      callback(error);
    });
  });

  steps.push(this.loadSuites.bind(this, files));

  if (options.waitForFrameworks) {
    steps.push(WCT.Util.whenFrameworksReady);
  }

  steps.push(function() {
    var runner = mocha.run();
    if (socket) socket.observe(runner);
  });

  async.series(steps);
}

/**
 * Loads suites of tests, supporting `.js` as well as `.html` files.
 *
 * @param {!Array.<string>} files The files to load.
 * @param {function} done A callback that fires once all files have loaded.
 */
WCT.loadSuites = function loadSuites(files, done) {
  var loaders = files.map(function(file) {
    if (file.slice(-3) === '.js') {
      return WCT.Util.loadScript.bind(WCT.Util, file);
    } else if (file.slice(-5) === '.html') {
      return WCT.SubSuite.load.bind(WCT.SubSuite, file);
    } else {
      throw new Error('Unknown resource type ' + file);
    }
  }.bind(this));

  async.parallel(loaders, done);
};

})();
