/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
/**
 * @fileoverview
 *
 * Runs all tests described by this document, after giving the document a chance
 * to load.
 *
 * If `WCT.waitForFrameworks` is true (the default), we will also wait for any
 * present web component frameworks to have fully initialized as well.
 */

// We process grep ourselves to avoid loading suites that will be filtered.
var GREP = WCT.util.getParam('grep');

// The actual startup process.

loadEnvironmentSync();

// Give any scripts on the page a chance to twiddle the environment.
document.addEventListener('DOMContentLoaded', function() {
  WCT.util.debug('DOMContentLoaded');

  // We need the socket built prior to building its reporter.
  WCT.CLISocket.init(function(error, socket) {
    if (error) throw error;

    // Are we a child of another run?
    var current = WCT.ChildRunner.current();
    var parent  = current && current.parentScope.WCT._reporter;
    WCT.util.debug('parentReporter:', parent);

    var childSuites = activeChildSuites();
    var reporters   = determineReporters(socket, parent);
    // +1 for any local tests.
    var reporter = new WCT.MultiReporter(childSuites.length + 1, reporters, parent);
    WCT._reporter = reporter;

    // We need the reporter so that we can report errors during load.
    loadDependencies(reporter, function(error) {
      // Let our parent know that we're about to start the tests.
      if (current) current.ready(error);
      if (error) throw error;

      runTests(reporter, childSuites, function(error) {
        // Make sure to let our parent know that we're done.
        if (current) current.done();
        if (error) throw error;
      });
    });
  });
});


// Run Steps

/**
 * We _synchronously_ load environment.js so that it is immediately ready for
 * the user's document(s), and available for inline scripts.
 */
function loadEnvironmentSync() {
  // environment.js is optional; we need to take a look at our script's URL in
  // order to determine how (or not) to load it.
  var prefix  = window.WCTPrefix;
  var loadEnv = !window.WCTSkipEnvironment;

  var scripts = document.querySelectorAll('script[src*="browser.js"]');
  if (scripts.length !== 1 && !prefix) {
    throw new Error('Unable to detect root URL for WCT. Please set WCTPrefix before including browser.js');
  }
  if (scripts[0]) {
    var thisScript = scripts[0].src;
    prefix  = thisScript.substring(0, thisScript.indexOf('browser.js'));
    // You can tack ?skipEnv onto the browser URL to skip the default environment.
    loadEnv = thisScript.indexOf('skipEnv') === -1;
  }
  if (loadEnv) {
    // Synchronous load.
    document.write('<script src="' + prefix + 'environment.js"></script>'); // jshint ignore:line
  }
}

/**
 * Loads any dependencies of the _current_ suite (e.g. `.js` sources).
 *
 * @param {!WCT.MultiReporter} reporter
 * @param {function} done
 */
function loadDependencies(reporter, done) {
  WCT.util.debug('loadDependencies', WCT._dependencies);

  function onError(event) {
    reporter.emitOutOfBandTest('Test Suite Initialization', event.error);
  }
  window.addEventListener('error', onError);

  var loaders = WCT._dependencies.map(function(file) {
    // We only support `.js` dependencies for now.
    return WCT.util.loadScript.bind(WCT.util, file);
  });

  WCT.util.parallel(loaders, function(error) {
    window.removeEventListener('error', onError);
    done(error);
  });
}

/**
 * @param {!WCT.MultiReporter} reporter
 * @param {!Array.<string>} childSuites
 * @param {function} done
 */
function runTests(reporter, childSuites, done) {
  WCT.util.debug('runTests');

  var suiteRunners = [
    // Run the local tests (if any) first, not stopping on error;
    runMocha.bind(null, reporter),
  ];

  // As well as any sub suites. Again, don't stop on error.
  childSuites.forEach(function(file) {
    suiteRunners.push(function(next) {
      var childRunner = new WCT.ChildRunner(file, window);
      reporter.emit('childRunner start', childRunner);
      childRunner.run(function(error) {
        reporter.emit('childRunner end', childRunner);
        if (error) reporter.emitOutOfBandTest(file, error);
        next();
      });
    });
  });

  WCT.util.parallel(suiteRunners, WCT.numConcurrentSuites, function(error) {
    reporter.done();
    done(error);
  });
}

/**
 * Kicks off a mocha run, waiting for frameworks to load if necessary.
 *
 * @param {!WCT.MultiReporter} reporter Where to send Mocha's events.
 * @param {function} done A callback fired, _no error is passed_.
 */
function runMocha(reporter, done, waited) {
  if (WCT.waitForFrameworks && !waited) {
    WCT.util.whenFrameworksReady(runMocha.bind(null, reporter, done, true));
    return;
  }
  WCT.util.debug('runMocha');

  mocha.reporter(reporter.childReporter(window.location));
  mocha.suite.title = reporter.suiteTitle(window.location);
  mocha.grep(GREP);

  // We can't use `mocha.run` because it bashes over grep, invert, and friends.
  // See https://github.com/visionmedia/mocha/blob/master/support/tail.js#L137
  var runner = Mocha.prototype.run.call(mocha, function(error) {
    Mocha.utils.highlightTags('code');
    done();  // We ignore the Mocha failure count.
  });

  // Mocha's default `onerror` handling strips the stack (to support really old
  // browsers). We upgrade this to get better stacks for async errors.
  //
  // TODO(nevir): Can we expand support to other browsers?
  if (navigator.userAgent.match(/chrome/i)) {
    window.onerror = null;
    window.addEventListener('error', function(event) {
      if (!event.error) return;
      if (event.error.ignore) return;
      runner.uncaught(event.error);
    });
  }
}

// Helpers

/**
 * @return {!Array.<string>} The child suites that should be loaded, ignoring
 *     those that would not match `GREP`.
 */
function activeChildSuites() {
  var subsuites = WCT._suitesToLoad;
  if (GREP) {
    var cleanSubsuites = [];
    for (var i = 0, subsuite; subsuite = subsuites[i]; i++) {
      if (GREP.indexOf(WCT.util.cleanLocation(subsuite)) !== -1) {
        cleanSubsuites.push(subsuite);
      }
    }
    subsuites = cleanSubsuites;
  }
  return subsuites;
}

/**
 * @param {WCT.CLISocket} socket The CLI socket, if present.
 * @param {WCT.MultiReporter} parent The parent reporter, if present.
 * @return {!Array.<!Mocha.reporters.Base} The reporters that should be used.
 */
function determineReporters(socket, parent) {
  // Parents are greedy.
  if (parent) {
    return [parent.childReporter(window.location)];
  }

  // Otherwise, we get to run wild without any parental supervision!
  var reporters = [
    WCT.reporters.Title,
    WCT.reporters.Console,
  ];

  if (socket) {
    reporters.push(function(runner) {
      socket.observe(runner);
    });
  }

  if (WCT._suitesToLoad.length > 0 || WCT._dependencies.length > 0) {
    reporters.push(WCT.reporters.HTML);
  }

  return reporters;
}
