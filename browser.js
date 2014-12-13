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
 * Your entry point into `web-component-tester`'s environment and configuration.
 */
(function() {

var WCT = window.WCT = {
  reporters: {},
};

// Configuration

/** By default, we wait for any web component frameworks to load. */
WCT.waitForFrameworks = true;

/** How many `.html` suites that can be concurrently loaded & run. */
WCT.numConcurrentSuites = 1;

// Helpers

// Evaluated in mocha/run.js.
WCT._suitesToLoad = [];
WCT._dependencies = [];

// Used to share data between childRunners on client and reporters on server
WCT.share = {};

/**
 * Loads suites of tests, supporting `.js` as well as `.html` files.
 *
 * @param {!Array.<string>} files The files to load.
 */
WCT.loadSuites = function loadSuites(files) {
  files.forEach(function(file) {
    if (file.slice(-3) === '.js') {
      WCT._dependencies.push(file);
    } else if (file.slice(-5) === '.html') {
      WCT._suitesToLoad.push(file);
    } else {
      throw new Error('Unknown resource type: ' + file);
    }
  });
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.util = {};

/**
 * @param {function()} callback A function to call when the active web component
 *     frameworks have loaded.
 */
WCT.util.whenFrameworksReady = function(callback) {
  WCT.util.debug('WCT.util.whenFrameworksReady');
  var done = function() {
    WCT.util.debug('WCT.util.whenFrameworksReady done');
    callback();
  };

  function importsReady() {
    window.removeEventListener('HTMLImportsLoaded', importsReady);
    WCT.util.debug('HTMLImportsLoaded');

    if (window.Polymer && Polymer.whenReady) {
      Polymer.whenReady(function() {
        WCT.util.debug('polymer-ready');
        done();
      });
    } else {
      done();
    }
  }

  // All our supported framework configurations depend on imports.
  if (!window.HTMLImports) {
    done();
  } else if (HTMLImports.ready) {
    importsReady();
  } else {
    window.addEventListener('HTMLImportsLoaded', importsReady);
  }
};

/**
 * @param {number} count
 * @param {string} kind
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
WCT.util.pluralizedStat = function pluralizedStat(count, kind) {
  if (count === 1) {
    return count + ' ' + kind + ' test';
  } else {
    return count + ' ' + kind + ' tests';
  }
};

/**
 * @param {string} path The URI of the script to load.
 * @param {function} done
 */
WCT.util.loadScript = function loadScript(path, done) {
  var script = document.createElement('script');
  script.src = path + '?' + Math.random();
  script.onload = done.bind(null, null);
  script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  document.head.appendChild(script);
};

/**
 * @param {...*} var_args Logs values to the console when `WCT.debug` is true.
 */
WCT.util.debug = function debug(var_args) {
  if (!WCT.debug) return;
  var args = [window.location.pathname];
  args.push.apply(args, arguments);
  console.debug.apply(console, args);
};

// URL Processing

/**
 * @param {string} opt_query A query string to parse.
 * @return {!Object.<string, !Array.<string>>} All params on the URL's query.
 */
WCT.util.getParams = function getParams(opt_query) {
  var query = opt_query || window.location.search;
  if (query.substring(0, 1) === '?') {
    query = query.substring(1);
  }
  // python's SimpleHTTPServer tacks a `/` on the end of query strings :(
  if (query.slice(-1) === '/') {
    query = query.substring(0, query.length - 1);
  }
  if (query === '') return {};

  var result = {};
  query.split('&').forEach(function(part) {
    var pair = part.split('=');
    if (pair.length !== 2) {
      console.warn('Invalid URL query part:', part);
      return;
    }
    var key   = decodeURIComponent(pair[0]);
    var value = decodeURIComponent(pair[1]);

    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(value);
  });

  return result;
};

/**
 * @param {string} param The param to return a value for.
 * @return {?string} The first value for `param`, if found.
 */
WCT.util.getParam = function getParam(param) {
  var params = WCT.util.getParams();
  return params[param] ? params[param][0] : null;
};

/**
 * @param {!Object.<string, !Array.<string>>} params
 * @return {string} `params` encoded as a URI query.
 */
WCT.util.paramsToQuery = function paramsToQuery(params) {
  var pairs = [];
  Object.keys(params).forEach(function(key) {
    params[key].forEach(function(value) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
  });
  return '?' + pairs.join('&');
};

/**
 * @param {!Location|string} location
 * @return {string}
 */
WCT.util.basePath = function basePath(location) {
  return (location.pathname || location).match(/^.*\//)[0];
};

/**
 * @param {!Location|string} location
 * @param {string} basePath
 * @return {string}
 */
WCT.util.relativeLocation = function relativeLocation(location, basePath) {
  var path = location.pathname || location;
  if (path.indexOf(basePath) === 0) {
    path = path.substring(basePath.length);
  }
  return path;
};

/**
 * @param {!Location|string} location
 * @return {string}
 */
WCT.util.cleanLocation = function cleanLocation(location) {
  var path = location.pathname || location;
  if (path.slice(-11) === '/index.html') {
    path = path.slice(0, path.length - 10);
  }
  return path;
};

/**
 * Like `async.parallelLimit`, but our own so that we don't force a dependency
 * on downstream code.
 *
 * @param {!Array.<function(function(*))>} runners Runners that call their given
 *     Node-style callback when done.
 * @param {number|function(*)} limit Maximum number of concurrent runners.
 *     (optional).
 * @param {?function(*)} done Callback that should be triggered once all runners
 *     have completed, or encountered an error.
 */
WCT.util.parallel = function parallel(runners, limit, done) {
  if (typeof limit !== 'number') {
    done  = limit;
    limit = 0;
  }
  if (!runners.length) return done();

  var called    = false;
  var total     = runners.length;
  var numActive = 0;
  var numDone   = 0;

  function runnerDone(error) {
    if (called) return;
    numDone = numDone + 1;
    numActive = numActive - 1;

    if (error || numDone >= total) {
      called = true;
      done(error);
    } else {
      runOne();
    }
  }

  function runOne() {
    if (limit && numActive >= limit) return;
    if (!runners.length) return;
    numActive = numActive + 1;
    runners.shift()(runnerDone);
  }
  runners.forEach(runOne);
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

// TODO(thedeeno): Consider renaming subsuite. IIRC, childRunner is entirely
// distinct from mocha suite, which tripped me up badly when trying to add
// plugin support. Perhaps something like 'batch', or 'bundle'. Something that
// has no mocha correlate. This may also eliminate the need for root/non-root
// suite distinctions.

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
function ChildRunner(url, parentScope) {
  var params = WCT.util.getParams(parentScope.location.search);
  delete params.cli_browser_id;
  params.bust = [Math.random()];

  this.url         = url + WCT.util.paramsToQuery(params);
  this.parentScope = parentScope;

  this.state = 'initializing';
}
WCT.ChildRunner = ChildRunner;

// ChildRunners get a pretty generous load timeout by default.
ChildRunner.loadTimeout = 30000;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track childRunners by URL.
ChildRunner._byUrl = {};

/**
 * @return {ChildRunner} The `ChildRunner` that was registered for this window.
 */
ChildRunner.current = function() {
  return ChildRunner.get(window);
};

/**
 * @param {!Window} target A window to find the ChildRunner of.
 * @param {boolean} traversal Whether this is a traversal from a child window.
 * @return {ChildRunner} The `ChildRunner` that was registered for `target`.
 */
ChildRunner.get = function(target, traversal) {
  var childRunner = ChildRunner._byUrl[target.location.href];
  if (childRunner) return childRunner;
  if (window.parent === window) {  // Top window.
    if (traversal) {
      console.warn('Subsuite loaded but was never registered. This most likely is due to wonky history behavior. Reloading...');
      window.location.reload();
    }
    return null;
  }
  // Otherwise, traverse.
  return window.parent.WCT.ChildRunner.get(target, true);
};

/**
 * Hangs a reference to the ChildRunner's iframe-local wct object
 *
 * TODO(thedeeno): This method is odd to document so the achitecture might need
 * a little rework here. Maybe another named concept? Seeing WCT everywhere is
 * pretty confusing. Also, I don't think we need the parentScope.WCT; to limit
 * confusion I didn't include it.
 *
 * @param {object} wct The ChildRunner's iframe-local wct object
 */
ChildRunner.prototype.prepare = function(wct) {
  this.share = wct.share;
};

/**
 * Loads and runs the subsuite.
 *
 * @param {function} done Node-style callback.
 */
ChildRunner.prototype.run = function(done) {
  WCT.util.debug('ChildRunner#run', this.url);
  this.state = 'loading';
  this.onRunComplete = done;

  this.iframe = document.createElement('iframe');
  this.iframe.src = this.url;
  this.iframe.classList.add('subsuite');

  var container = document.getElementById('subsuites');
  if (!container) {
    container = document.createElement('div');
    container.id = 'subsuites';
    document.body.appendChild(container);
  }
  container.appendChild(this.iframe);

  // let the iframe expand the URL for us.
  this.url = this.iframe.src;
  ChildRunner._byUrl[this.url] = this;

  this.timeoutId = setTimeout(
      this.loaded.bind(this, new Error('Timed out loading ' + this.url)), ChildRunner.loadTimeout);

  this.iframe.addEventListener('error',
      this.loaded.bind(this, new Error('Failed to load document ' + this.url)));

  this.iframe.contentWindow.addEventListener('DOMContentLoaded', this.loaded.bind(this, null));
};

/**
 * Called when the sub suite's iframe has loaded (or errored during load).
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.loaded = function(error) {
  WCT.util.debug('ChildRunner#loaded', this.url, error);
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/**
 * Called in mocha/run.js when all dependencies have loaded, and the child is
 * ready to start running tests
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.ready = function(error) {
  WCT.util.debug('ChildRunner#ready', this.url, error);
  if (this.timeoutId) {
    clearTimeout(this.timeoutId);
  }
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/** Called when the sub suite's tests are complete, so that it can clean up. */
ChildRunner.prototype.done = function done() {
  WCT.util.debug('ChildRunner#done', this.url, arguments);

  this.signalRunComplete();

  if (!this.iframe) return;
  this.iframe.parentNode.removeChild(this.iframe);
};

ChildRunner.prototype.signalRunComplete = function signalRunComplete(error) {
  if (!this.onRunComplete) return;
  this.state = 'complete';
  this.onRunComplete(error);
  this.onRunComplete = null;
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.CLISocket = CLISocket;

var SOCKETIO_ENDPOINT = window.location.protocol + '//' + window.location.host;
var SOCKETIO_LIBRARY  = SOCKETIO_ENDPOINT + '/socket.io/socket.io.js';

/**
 * A socket for communication between the CLI and browser runners.
 *
 * @param {string} browserId An ID generated by the CLI runner.
 * @param {!io.Socket} socket The socket.io `Socket` to communicate over.
 */
function CLISocket(browserId, socket) {
  this.browserId = browserId;
  this.socket    = socket;
}

/**
 * @param {!Mocha.Runner} runner The Mocha `Runner` to observe, reporting
 *     interesting events back to the CLI runner.
 */
CLISocket.prototype.observe = function observe(runner) {
  this.emitEvent('browser-start', {
    url: window.location.toString(),
  });

  // We only emit a subset of events that we care about, and follow a more
  // general event format that is hopefully applicable to test runners beyond
  // mocha.
  //
  // For all possible mocha events, see:
  // https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36
  runner.on('test', function(test) {
    this.emitEvent('test-start', {test: getTitles(test)});
  }.bind(this));

  runner.on('test end', function(test) {
    this.emitEvent('test-end', {
      state:    getState(test),
      test:     getTitles(test),
      duration: test.duration,
      error:    test.err,
    });
  }.bind(this));

  runner.on('childRunner start', function(childRunner) {
    this.emitEvent('sub-suite-start', childRunner.share);
  }.bind(this));

  runner.on('childRunner end', function(childRunner) {
    this.emitEvent('sub-suite-end', childRunner.share);
  }.bind(this));

  runner.on('end', function() {
    this.emitEvent('browser-end');
  }.bind(this));
};

/**
 * @param {string} event The name of the event to fire.
 * @param {*} data Additional data to pass with the event.
 */
CLISocket.prototype.emitEvent = function emitEvent(event, data) {
  this.socket.emit('client-event', {
    browserId: this.browserId,
    event:     event,
    data:      data,
  });
};

/**
 * Builds a `CLISocket` if we are within a CLI-run environment; short-circuits
 * otherwise.
 *
 * @param {function(*, CLISocket)} done Node-style callback.
 */
CLISocket.init = function init(done) {
  var browserId = WCT.util.getParam('cli_browser_id');
  if (!browserId) return done();
  // Only fire up the socket for root runners.
  if (WCT.ChildRunner.current()) return done();

  WCT.util.loadScript(SOCKETIO_LIBRARY, function(error) {
    if (error) return done(error);

    var socket = io(SOCKETIO_ENDPOINT);
    socket.on('error', function(error) {
      socket.off();
      done(error);
    });

    socket.on('connect', function() {
      socket.off();
      done(null, new CLISocket(browserId, socket));
    });
  });
};

// Misc Utility

/**
 * @param {!Mocha.Runnable} runnable The test or suite to extract titles from.
 * @return {!Array.<string>} The titles of the runnable and its parents.
 */
function getTitles(runnable) {
  var titles = [];
  while (runnable && !runnable.root && runnable.title) {
    titles.unshift(runnable.title);
    runnable = runnable.parent;
  }
  return titles;
}

/**
 * @param {!Mocha.Runnable} runnable
 * @return {string}
 */
function getState(runnable) {
  if (runnable.state === 'passed') {
    return 'passing';
  } else if (runnable.state == 'failed') {
    return 'failing';
  } else if (runnable.pending) {
    return 'pending';
  } else {
    return 'unknown';
  }
}

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

// polymer-test-tools (and Polymer/tools) support HTML tests where each file is
// expected to call `done()`, which posts a message to the parent window.
window.addEventListener('message', function(event) {
  if (!event.data || (event.data !== 'ok' && !event.data.error)) return;
  var childRunner = WCT.ChildRunner.get(event.source);
  if (!childRunner) return;

  childRunner.ready();
  // The name of the suite as exposed to the user.
  var reporter = childRunner.parentScope.WCT._reporter;
  var title    = reporter.suiteTitle(event.source.location);
  reporter.emitOutOfBandTest('page-wide tests via global done()', event.data.error, title, true);

  childRunner.done();
});

// Attempt to ensure that we complete a test suite if it is interrupted by a
// document unload.
window.addEventListener('unload', function(event) {
  // Mocha's hook queue is asynchronous; but we want synchronous behavior if
  // we've gotten to the point of unloading the document.
  Mocha.Runner.immediately = function(callback) { callback(); };
});

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

/**
 * Runs `stepFn`, catching any error and passing it to `callback` (Node-style).
 * Otherwise, calls `callback` with no arguments on success.
 *
 * @param {function()} callback
 * @param {function()} stepFn
 */
window.safeStep = function safeStep(callback, stepFn) {
  var err;
  try {
    stepFn();
  } catch (error) {
    err = error;
  }
  callback(err);
};

/**
 * Runs your test at declaration time (before Mocha has begun tests). Handy for
 * when you need to test document initialization.
 *
 * Be aware that any errors thrown asynchronously cannot be tied to your test.
 * You may want to catch them and pass them to the done event, instead. See
 * `safeStep`.
 *
 * @param {string} name The name of the test.
 * @param {function(?function())} testFn The test function. If an argument is
 *     accepted, the test will be treated as async, just like Mocha tests.
 */
window.testImmediate = function testImmediate(name, testFn) {
  if (testFn.length > 0) {
    return testImmediateAsync(name, testFn);
  }

  var err;
  try {
    testFn();
  } catch (error) {
    err = error;
  }

  test(name, function(done) {
    done(err);
  });
};

/**
 * An async-only variant of `testImmediate`.
 *
 * @param {string} name
 * @param {function(?function())} testFn
 */
window.testImmediateAsync = function testImmediateAsync(name, testFn) {
  var testComplete = false;
  var err;

  test(name, function(done) {
    var intervalId = setInterval(function() {
      if (!testComplete) return;
      clearInterval(intervalId);
      done(err);
    }, 10);
  });

  try {
    testFn(function(error) {
      if (error) err = error;
      testComplete = true;
    });
  } catch (error) {
    err = error;
  }
};

/**
 * Triggers a flush of any pending events, observations, etc and calls you back
 * after they have been processed.
 *
 * @param {function()} callback
 */
window.flush = function flush(callback) {
  // Ideally, this function would be a call to Polymer.flush, but that doesn't
  // support a callback yet (https://github.com/Polymer/polymer-dev/issues/115),
  // ...and there's cross-browser flakiness to deal with.

  // Make sure that we're invoking the callback with no arguments so that the
  // caller can pass Mocha callbacks, etc.
  var done = function done() { callback(); };

  // Because endOfMicrotask is flaky for IE, we perform microtask checkpoints
  // ourselves (https://github.com/Polymer/polymer-dev/issues/114):
  var isIE = navigator.appName == 'Microsoft Internet Explorer';
  if (isIE && window.Platform && window.Platform.performMicrotaskCheckpoint) {
    var reallyDone = done;
    done = function doneIE() {
      Platform.performMicrotaskCheckpoint();
      setTimeout(reallyDone, 0);
    };
  }

  // Everyone else gets a regular flush.
  var scope = window.Polymer || window.WebComponents;
  if (scope && scope.flush) {
    scope.flush();
  }

  // Ensure that we are creating a new _task_ to allow all active microtasks to
  // finish (the code you're testing may be using endOfMicrotask, too).
  setTimeout(done, 0);
};

/**
 * Advances a single animation frame.
 *
 * Calls `flush`, `requestAnimationFrame`, `flush`, and `callback` sequentially
 * @param {function()} callback
 */
window.animationFrameFlush = function animationFrameFlush(callback) {
  flush(function() {
    requestAnimationFrame(function() {
      flush(callback);
    });
  });
};

/**
 * DEPRECATED: Use `flush`.
 * @param {function} callback
 */
window.asyncPlatformFlush = function asyncPlatformFlush(callback) {
  console.warn('asyncPlatformFlush is deprecated in favor of the more terse flush()');
  return window.flush(callback);
};

/**
 *
 */
window.waitFor = function waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime) {
  timeoutTime = timeoutTime || Date.now() + (timeout || 1000);
  intervalOrMutationEl = intervalOrMutationEl || 32;
  try {
    fn();
  } catch (e) {
    if (Date.now() > timeoutTime) {
      throw e;
    } else {
      if (isNaN(intervalOrMutationEl)) {
        intervalOrMutationEl.onMutation(intervalOrMutationEl, function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        });
      } else {
        setTimeout(function() {
          waitFor(fn, next, intervalOrMutationEl, timeout, timeoutTime);
        }, intervalOrMutationEl);
      }
      return;
    }
  }
  next();
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.MultiReporter = MultiReporter;

var STACKY_CONFIG = {
  indent: '  ',
  locationStrip: [
    /^https?:\/\/[^\/]+/,
    /\?.*$/,
  ],
  filter: function(line) {
    return line.location.match(/\/web-component-tester\/[^\/]+(\?.*)?$/);
  },
};

// https://github.com/visionmedia/mocha/blob/master/lib/runner.js#L36-46
var MOCHA_EVENTS = [
  'start',
  'end',
  'suite',
  'suite end',
  'test',
  'test end',
  'hook',
  'hook end',
  'pass',
  'fail',
  'pending',
];

// Until a suite has loaded, we assume this many tests in it.
var ESTIMATED_TESTS_PER_SUITE = 3;

/**
 * A Mocha-like reporter that combines the output of multiple Mocha suites.
 *
 * @param {number} numSuites The number of suites that will be run, in order to
 *     estimate the total number of tests that will be performed.
 * @param {!Array.<!Mocha.reporters.Base>} reporters The set of reporters that
 *     should receive the unified event stream.
 * @param {WCT.MultiReporter} parent The parent reporter, if present.
 */
function MultiReporter(numSuites, reporters, parent) {
  this.reporters = reporters.map(function(reporter) {
    return new reporter(this);
  }.bind(this));

  this.parent = parent;
  this.basePath = parent && parent.basePath || WCT.util.basePath(window.location);

  this.total = numSuites * ESTIMATED_TESTS_PER_SUITE;
  // Mocha reporters assume a stream of events, so we have to be careful to only
  // report on one runner at a time...
  this.currentRunner = null;
  // ...while we buffer events for any other active runners.
  this.pendingEvents = [];

  this.emit('start');
}
// Mocha doesn't expose its `EventEmitter` shim directly, so:
MultiReporter.prototype = Object.create(Object.getPrototypeOf(Mocha.Runner.prototype));

/**
 * @param {!Location|string} location The location this reporter represents.
 * @return {!Mocha.reporters.Base} A reporter-like "class" for each child suite
 *     that should be passed to `mocha.run`.
 */
MultiReporter.prototype.childReporter = function childReporter(location) {
  var name = this.suiteTitle(location);
  // The reporter is used as a constructor, so we can't depend on `this` being
  // properly bound.
  var self = this;
  function reporter(runner) {
    runner.name = name;
    self.bindChildRunner(runner);
  }
  reporter.title = name;
  return reporter;
};

/** Must be called once all runners have finished. */
MultiReporter.prototype.done = function done() {
  this.complete = true;
  this.flushPendingEvents();
  this.emit('end');
};

/**
 * Emit a top level test that is not part of any suite managed by this reporter.
 *
 * Helpful for reporting on global errors, loading issues, etc.
 *
 * @param {string} title The title of the test.
 * @param {*} opt_error An error associated with this test. If falsy, test is
 *     considered to be passing.
 * @param {string} opt_suiteTitle Title for the suite that's wrapping the test.
 * @param {?boolean} opt_estimated If this test was included in the original
 *     estimate of `numSuites`.
 */
MultiReporter.prototype.emitOutOfBandTest = function emitOutOfBandTest(title, opt_error, opt_suiteTitle, opt_estimated) {
  WCT.util.debug('MultiReporter#emitOutOfBandTest(', arguments, ')');
  var root = new Mocha.Suite();
  root.title = opt_suiteTitle || '';
  var test = new Mocha.Test(title, function() {
  });
  test.parent = root;
  test.state  = opt_error ? 'failed' : 'passed';
  test.err    = opt_error;

  if (!opt_estimated) {
    this.total = this.total + ESTIMATED_TESTS_PER_SUITE;
  }

  var runner = {total: 1};
  this.proxyEvent('start', runner);
  this.proxyEvent('suite', runner, root);
  this.proxyEvent('test', runner, test);
  if (opt_error) {
    this.proxyEvent('fail', runner, test, opt_error);
  } else {
    this.proxyEvent('pass', runner, test);
  }
  this.proxyEvent('test end', runner, test);
  this.proxyEvent('suite end', runner, root);
  this.proxyEvent('end', runner);
};

/**
 * @param {!Location|string} location
 * @return {string}
 */
MultiReporter.prototype.suiteTitle = function suiteTitle(location) {
  var path = WCT.util.relativeLocation(location, this.basePath);
  path = WCT.util.cleanLocation(path);
  return path;
};

// Internal Interface

/** @param {!Mocha.runners.Base} runner The runner to listen to events for. */
MultiReporter.prototype.bindChildRunner = function bindChildRunner(runner) {
  MOCHA_EVENTS.forEach(function(eventName) {
    runner.on(eventName, this.proxyEvent.bind(this, eventName, runner));
  }.bind(this));
};

/**
 * Evaluates an event fired by `runner`, proxying it forward or buffering it.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {...*} var_args Any additional data passed as part of the event.
 */
MultiReporter.prototype.proxyEvent = function proxyEvent(eventName, runner, var_args) {
  var extraArgs = Array.prototype.slice.call(arguments, 2);
  if (this.complete) {
    console.warn('out of order Mocha event for ' + runner.name + ':', eventName, extraArgs);
    return;
  }

  if (this.currentRunner && runner !== this.currentRunner) {
    this.pendingEvents.push(arguments);
    return;
  }
  WCT.util.debug('MultiReporter#proxyEvent(', arguments, ')');

  // This appears to be a Mocha bug: Tests failed by passing an error to their
  // done function don't set `err` properly.
  //
  // TODO(nevir): Track down.
  if (eventName === 'fail' && !extraArgs[0].err) {
    extraArgs[0].err = extraArgs[1];
  }

  if (eventName === 'start') {
    this.onRunnerStart(runner);
  } else if (eventName === 'end') {
    this.onRunnerEnd(runner);
  } else {
    this.cleanEvent(eventName, runner, extraArgs);
    this.emit.apply(this, [eventName].concat(extraArgs));
  }
};

/**
 * Cleans or modifies an event if needed.
 *
 * @param {string} eventName
 * @param {!Mocha.runners.Base} runner The runner that emitted this event.
 * @param {!Array.<*>} extraArgs
 */
MultiReporter.prototype.cleanEvent = function cleanEvent(eventName, runner, extraArgs) {
  // Suite hierarchy
  if (extraArgs[0]) {
    extraArgs[0] = this.showRootSuite(extraArgs[0]);
  }

  // Normalize errors
  if (eventName === 'fail') {
    extraArgs[1] = Stacky.normalize(extraArgs[1], STACKY_CONFIG);
  }
  if (extraArgs[0] && extraArgs[0].err) {
    extraArgs[0].err = Stacky.normalize(extraArgs[0].err, STACKY_CONFIG);
  }
};

/**
 * We like to show the root suite's title, which requires a little bit of
 * trickery in the suite hierarchy.
 *
 * @param {!Mocha.Runnable} node
 */
MultiReporter.prototype.showRootSuite = function showRootSuite(node) {
  var leaf = node = Object.create(node);
  while (node && node.parent) {
    var wrappedParent = Object.create(node.parent);
    node.parent = wrappedParent;
    node = wrappedParent;
  }
  node.root = false;

  return leaf;
};

/** @param {!Mocha.runners.Base} runner */
MultiReporter.prototype.onRunnerStart = function onRunnerStart(runner) {
  WCT.util.debug('MultiReporter#onRunnerStart:', runner.name);
  this.total = this.total - ESTIMATED_TESTS_PER_SUITE + runner.total;
  this.currentRunner = runner;
};

/** @param {!Mocha.runners.Base} runner */
MultiReporter.prototype.onRunnerEnd = function onRunnerEnd(runner) {
  WCT.util.debug('MultiReporter#onRunnerEnd:', runner.name);
  this.currentRunner = null;
  this.flushPendingEvents();
};

/**
 * Flushes any buffered events and runs them through `proxyEvent`. This will
 * loop until all buffered runners are complete, or we have run out of buffered
 * events.
 */
MultiReporter.prototype.flushPendingEvents = function flushPendingEvents() {
  var events = this.pendingEvents;
  this.pendingEvents = [];
  events.forEach(function(eventArgs) {
    this.proxyEvent.apply(this, eventArgs);
  }.bind(this));
};

})();

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
 * Provides automatic configuration of Mocha by stubbing out potential Mocha
 * methods, and configuring Mocha appropriately once you call them.
 *
 * Just call `suite`, `describe`, etc normally, and everything should Just Work.
 */
(function() {

// Mocha global helpers, broken out by testing method.
var MOCHA_EXPORTS = {
  // https://github.com/visionmedia/mocha/blob/master/lib/interfaces/tdd.js
  tdd: [
    'setup',
    'teardown',
    'suiteSetup',
    'suiteTeardown',
    'suite',
    'test',
  ],
  // https://github.com/visionmedia/mocha/blob/master/lib/interfaces/tdd.js
  bdd: [
    'before',
    'after',
    'beforeEach',
    'afterEach',
    'describe',
    'xdescribe',
    'xcontext',
    'it',
    'xit',
    'specify',
    'xspecify',
  ],
};

// We expose all Mocha methods up front, configuring and running mocha
// automatically when you call them.
//
// The assumption is that it is a one-off (sub-)suite of tests being run.
Object.keys(MOCHA_EXPORTS).forEach(function(ui) {
  MOCHA_EXPORTS[ui].forEach(function(key) {
    window[key] = function wrappedMochaFunction() {
      WCT.setupMocha(ui);
      if (!window[key] || window[key] === wrappedMochaFunction) {
        throw new Error('Expected mocha.setup to define ' + key);
      }
      window[key].apply(window, arguments);
    };
  });
});

/**
 * @param {string} ui Sets up mocha to run `ui`-style tests.
 */
WCT.setupMocha = function setupMocha(ui) {
  if (WCT._mochaUI && WCT._mochaUI === ui) return;
  if (WCT._mochaUI && WCT._mochaUI !== ui) {
    throw new Error('Mixing ' + WCT._mochaUI + ' and ' + ui + ' Mocha styles is not supported.');
  }
  mocha.setup({ui: ui, timeout: 60 * 1000});  // Note that the reporter is configured in run.js.
  WCT.mochaIsSetup = true;
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.Console = Console;

// We capture console events when running tests; so make sure we have a
// reference to the original one.
var console = window.console;

var FONT = ';font: normal 13px "Roboto", "Helvetica Neue", "Helvetica", sans-serif;';
var STYLES = {
  plain:   FONT,
  suite:   'color: #5c6bc0' + FONT,
  test:    FONT,
  passing: 'color: #259b24' + FONT,
  pending: 'color: #e65100' + FONT,
  failing: 'color: #c41411' + FONT,
  stack:   'color: #c41411',
  results: FONT + 'font-size: 16px',
};

// I don't think we can feature detect this one...
var userAgent = navigator.userAgent.toLowerCase();
var CAN_STYLE_LOG   = userAgent.match('firefox') || userAgent.match('webkit');
var CAN_STYLE_GROUP = userAgent.match('webkit');
// Track the indent for faked `console.group`
var logIndent = '';

function log(text, style) {
  text = text.split('\n').map(function(l) { return logIndent + l; }).join('\n');
  if (CAN_STYLE_LOG) {
    console.log('%c' + text, STYLES[style] || STYLES.plain);
  } else {
    console.log(text);
  }
}

function logGroup(text, style) {
  if (CAN_STYLE_GROUP) {
    console.group('%c' + text, STYLES[style] || STYLES.plain);
  } else if (console.group) {
    console.group(text);
  } else {
    logIndent = logIndent + '  ';
    log(text, style);
  }
}

function logGroupEnd() {
  if (console.groupEnd) {
    console.groupEnd();
  } else {
    logIndent = logIndent.substr(0, logIndent.length - 2);
  }
}

function logException(error) {
  log(error.stack || error.message || error, 'stack');
}

/**
 * A Mocha reporter that logs results out to the web `console`.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function Console(runner) {
  Mocha.reporters.Base.call(this, runner);

  runner.on('suite', function(suite) {
    if (suite.root) return;
    logGroup(suite.title, 'suite');
  }.bind(this));

  runner.on('suite end', function(suite) {
    if (suite.root) return;
    logGroupEnd();
  }.bind(this));

  runner.on('test', function(test) {
    logGroup(test.title, 'test');
  }.bind(this));

  runner.on('pending', function(test) {
    logGroup(test.title, 'pending');
  }.bind(this));

  runner.on('fail', function(test, error) {
    logException(error);
  }.bind(this));

  runner.on('test end', function(test) {
    logGroupEnd();
  }.bind(this));

  runner.on('end', this.logSummary.bind(this));
}
Console.prototype = Object.create(Mocha.reporters.Base.prototype);

/** Prints out a final summary of test results. */
Console.prototype.logSummary = function logSummary() {
  logGroup('Test Results', 'results');

  if (this.stats.failures > 0) {
    log(WCT.util.pluralizedStat(this.stats.failures, 'failing'), 'failing');
  }
  if (this.stats.pending > 0) {
    log(WCT.util.pluralizedStat(this.stats.pending, 'pending'), 'pending');
  }
  log(WCT.util.pluralizedStat(this.stats.passes, 'passing'));

  if (!this.stats.failures) {
    log('test suite passed', 'passing');
  }
  log('Evaluated ' + this.stats.tests + ' tests in ' + this.stats.duration + 'ms.');
  logGroupEnd();
};

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.HTML = HTML;

/**
 * WCT-specific behavior on top of Mocha's default HTML reporter.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function HTML(runner) {
  var output = document.createElement('div');
  output.id = 'mocha';
  document.body.appendChild(output);

  runner.on('suite', function(test) {
    this.total = runner.total;
  }.bind(this));

  Mocha.reporters.HTML.call(this, runner);
}
HTML.prototype = Object.create(Mocha.reporters.HTML.prototype);

})();

/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.reporters.Title = Title;

var ARC_OFFSET = 0; // start at the right.
var ARC_WIDTH  = 6;

/**
 * A Mocha reporter that updates the document's title and favicon with
 * at-a-glance stats.
 *
 * @param {!Mocha.Runner} runner The runner that is being reported on.
 */
function Title(runner) {
  Mocha.reporters.Base.call(this, runner);

  runner.on('test end', this.report.bind(this));
}

/** Reports current stats via the page title and favicon. */
Title.prototype.report = function report() {
  this.updateTitle();
  this.updateFavicon();
};

/** Updates the document title with a summary of current stats. */
Title.prototype.updateTitle = function updateTitle() {
  if (this.stats.failures > 0) {
    document.title = WCT.util.pluralizedStat(this.stats.failures, 'failing');
  } else {
    document.title = WCT.util.pluralizedStat(this.stats.passes, 'passing');
  }
};

/**
 * Draws an arc for the favicon status, relative to the total number of tests.
 *
 * @param {!CanvasRenderingContext2D} context
 * @param {number} total
 * @param {number} start
 * @param {number} length
 * @param {string} color
 */
function drawFaviconArc(context, total, start, length, color) {
  var arcStart = ARC_OFFSET + Math.PI * 2 * (start / total);
  var arcEnd   = ARC_OFFSET + Math.PI * 2 * ((start + length) / total);

  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth   = ARC_WIDTH;
  context.arc(16, 16, 16 - ARC_WIDTH / 2, arcStart, arcEnd);
  context.stroke();
}

/** Updates the document's favicon w/ a summary of current stats. */
Title.prototype.updateFavicon = function updateFavicon() {
  var canvas = document.createElement('canvas');
  canvas.height = canvas.width = 32;
  var context = canvas.getContext('2d');

  var passing = this.stats.passes;
  var pending = this.stats.pending;
  var failing = this.stats.failures;
  var total   = Math.max(this.runner.total, passing + pending + failing);
  drawFaviconArc(context, total, 0,                 passing, '#0e9c57');
  drawFaviconArc(context, total, passing,           pending, '#f3b300');
  drawFaviconArc(context, total, pending + passing, failing, '#ff5621');

  this.setFavicon(canvas.toDataURL());
};

/** Sets the current favicon by URL. */
Title.prototype.setFavicon = function setFavicon(url) {
  var current = document.head.querySelector('link[rel="icon"]');
  if (current) {
    document.head.removeChild(current);
  }

  var link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/x-icon';
  link.href = url;
  link.setAttribute('sizes', '32x32');
  document.head.appendChild(link);
};

})();

(function() {
var style = document.createElement('style');
style.textContent = '/**\n * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.\n * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt\n * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt\n * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt\n * Code distributed by Google as part of the polymer project is also\n * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt\n */\nhtml, body {\n  height: 100%;\n  width:  100%;\n}\n\n#mocha, #subsuites {\n  height: 100%;\n  position: absolute;\n  top: 0;\n  width: 50%;\n}\n\n#mocha {\n  box-sizing: border-box;\n  margin: 0 !important;\n  overflow-y: auto;\n  padding: 60px 50px;\n  right: 0;\n}\n\n#subsuites {\n  -ms-flex-direction: column;\n  -webkit-flex-direction: column;\n  display: -ms-flexbox;\n  display: -webkit-flex;\n  display: flex;\n  flex-direction: column;\n  left: 0;\n}\n\n#subsuites .subsuite {\n  border: 0;\n  width: 100%;\n  height: 100%;\n}\n\n#mocha .test.pass .duration {\n  color: #555;\n}\n';
document.head.appendChild(style);
})();