// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

/** By default, we wait for any web component frameworks to load. */
WCT.waitForFrameworks = true;

/** How many `.html` suites that can be concurrently loaded & run. */
WCT.numConcurrentSuites = 8;

// Give any scripts on the page a chance to twiddle the environment.
document.addEventListener('DOMContentLoaded', function() {
  var subSuite = WCT.SubSuite.current();
  if (subSuite) {
    return runSubSuite(subSuite);
  }

  // Before anything else, we need to ensure our communication channel with the
  // CLI runner is established (if we're running in that context). Less
  // buffering to deal with.
  WCT.CLISocket.init(function(error, socket) {
    var runner = new WCT.MultiRunner(countSubSuites() + 1, determineReporters(socket));
    WCT._multiRunner = runner;

    loadDependencies(function(error) {
      if (error) throw error;
      runMocha(runner.childReporter());
    });
  });
});

/**
 *
 */
function runSubSuite(subSuite) {
  // Not very pretty.
  var reporter = subSuite.parentScope.WCT._multiRunner.childReporter();
  runMocha(reporter, subSuite.done.bind(subSuite));
}

/**
 *
 */
function runMocha(reporter, done, waited) {
  if (WCT.waitForFrameworks && !waited) {
    WCT.Util.whenFrameworksReady(runMocha.bind(null, reporter, done, true));
    return;
  }

  mocha.reporter(reporter);
  mocha.run(done);
}

/**
 *
 */
function determineReporters(socket) {
  var reporters = [
    WCT.reporters.Title,
    WCT.reporters.Console,
  ];

  if (socket) {
    reporters.push(function(runner) {
      socket.observe(runner);
    });
  } else if (WCT.suitesToLoad.length > 0) {
    reporters.push(WCT.reporters.HTML);
  }

  return reporters;
}

/**
 *
 */
function loadDependencies(done) {
  var loaders =  WCT.suitesToLoad.map(function(file) {
    if (file.slice(-3) === '.js') {
      return WCT.Util.loadScript.bind(WCT.Util, file);
    } else if (file.slice(-5) === '.html') {
      return WCT.SubSuite.load.bind(WCT.SubSuite, file);
    } else {
      throw new Error('Unknown resource type ' + file);
    }
  }.bind(this));

  async.parallelLimit(loaders, WCT.numConcurrentSuites, done);
}

/**
 *
 */
function countSubSuites() {
  var count = 0;
  for (var i = 0, file; file = WCT.suitesToLoad[i]; i++) {
    if (file.slice(-5) === '.html') {
      count = count + 1;
    }
  }
  return count;
}

})();
