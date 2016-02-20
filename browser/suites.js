/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as config from './config.js';
import * as util from './util.js';
import ChildRunner from './childrunner.js';

export var htmlSuites = [];
export var jsSuites   = [];

// We process grep ourselves to avoid loading suites that will be filtered.
var GREP = util.getParam('grep');
// work around mocha bug (https://github.com/mochajs/mocha/issues/2070)
if (GREP) {
  GREP = GREP.replace(/\\\./g, '.');
}

/**
 * Loads suites of tests, supporting both `.js` and `.html` files.
 *
 * @param {!Array.<string>} files The files to load.
 */
export function loadSuites(files) {
  files.forEach(function(file) {
    if (/\.js(\?.*)?$/.test(file)) {
      jsSuites.push(file);
    } else if (/\.html(\?.*)?$/.test(file)) {
      htmlSuites.push(file);
    } else {
      throw new Error('Unknown resource type: ' + file);
    }
  });
}

/**
 * @return {!Array.<string>} The child suites that should be loaded, ignoring
 *     those that would not match `GREP`.
 */
export function activeChildSuites() {
  var subsuites = htmlSuites;
  if (GREP) {
    var cleanSubsuites = [];
    for (var i = 0, subsuite; subsuite = subsuites[i]; i++) {
      if (GREP.indexOf(util.cleanLocation(subsuite)) !== -1) {
        cleanSubsuites.push(subsuite);
      }
    }
    subsuites = cleanSubsuites;
  }
  return subsuites;
}

/**
 * Loads all `.js` sources requested by the current suite.
 *
 * @param {!MultiReporter} reporter
 * @param {function} done
 */
export function loadJsSuites(reporter, done) {
  util.debug('loadJsSuites', jsSuites);

  var loaders = jsSuites.map(function(file) {
    // We only support `.js` dependencies for now.
    return util.loadScript.bind(util, file);
  });

  util.parallel(loaders, done);
}

/**
 * @param {!MultiReporter} reporter
 * @param {!Array.<string>} childSuites
 * @param {function} done
 */
export function runSuites(reporter, childSuites, done) {
  util.debug('runSuites');

  var suiteRunners = [
    // Run the local tests (if any) first, not stopping on error;
    _runMocha.bind(null, reporter),
  ];

  // As well as any sub suites. Again, don't stop on error.
  childSuites.forEach(function(file) {
    suiteRunners.push(function(next) {
      var childRunner = new ChildRunner(file, window);
      reporter.emit('childRunner start', childRunner);
      childRunner.run(function(error) {
        reporter.emit('childRunner end', childRunner);
        if (error) reporter.emitOutOfBandTest(file, error);
        next();
      });
    });
  });

  util.parallel(suiteRunners, config.get('numConcurrentSuites'), function(error) {
    reporter.done();
    done(error);
  });
}

/**
 * Kicks off a mocha run, waiting for frameworks to load if necessary.
 *
 * @param {!MultiReporter} reporter Where to send Mocha's events.
 * @param {function} done A callback fired, _no error is passed_.
 */
function _runMocha(reporter, done, waited) {
  if (config.get('waitForFrameworks') && !waited) {
    var waitFor = (config.get('waitFor') || util.whenFrameworksReady).bind(window);
    waitFor(_runMocha.bind(null, reporter, done, true));
    return;
  }
  util.debug('_runMocha');
  var mocha = window.mocha;
  var Mocha = window.Mocha;

  mocha.reporter(reporter.childReporter(window.location));
  mocha.suite.title = reporter.suiteTitle(window.location);
  mocha.grep(GREP);

  // We can't use `mocha.run` because it bashes over grep, invert, and friends.
  // See https://github.com/visionmedia/mocha/blob/master/support/tail.js#L137
  var runner = Mocha.prototype.run.call(mocha, function(error) {
    if (document.getElementById('mocha')) {
      Mocha.utils.highlightTags('code');
    }
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
