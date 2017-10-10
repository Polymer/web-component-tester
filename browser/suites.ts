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
import ChildRunner from './childrunner.js';
import * as config from './config.js';
import MultiReporter from './reporters/multi.js';
import * as util from './util.js';

export let htmlSuites: string[] = [];
export let jsSuites: string[] = [];

// We process grep ourselves to avoid loading suites that will be filtered.
let GREP = util.getParam('grep');
// work around mocha bug (https://github.com/mochajs/mocha/issues/2070)
if (GREP) {
  GREP = GREP.replace(/\\\./g, '.');
}

/**
 * Loads suites of tests, supporting both `.js` and `.html` files.
 *
 * @param files The files to load.
 */
export function loadSuites(files: string[]) {
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
 * @return The child suites that should be loaded, ignoring
 *     those that would not match `GREP`.
 */
export function activeChildSuites(): string[] {
  let subsuites = htmlSuites;
  if (GREP) {
    const cleanSubsuites = [];
    for (let i = 0, subsuite; subsuite = subsuites[i]; i++) {
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
 */
export function loadJsSuites(
    _reporter: MultiReporter, done: (error: Error) => void) {
  util.debug('loadJsSuites', jsSuites);

  const loaders = jsSuites.map(function(file) {
    // We only support `.js` dependencies for now.
    return util.loadScript.bind(util, file);
  });

  util.parallel(loaders, done);
}

export function runSuites(
    reporter: MultiReporter, childSuites: string[],
    done: (error?: any) => void) {
  util.debug('runSuites');

  const suiteRunners: Array<(next: () => void) => void> = [
    // Run the local tests (if any) first, not stopping on error;
    _runMocha.bind(null, reporter),
  ];

  // As well as any sub suites. Again, don't stop on error.
  childSuites.forEach(function(file) {
    suiteRunners.push(function(next) {
      const childRunner = new ChildRunner(file, window);
      reporter.emit('childRunner start', childRunner);
      childRunner.run(function(error) {
        reporter.emit('childRunner end', childRunner);
        if (error)
          reporter.emitOutOfBandTest(file, error);
        next();
      });
    });
  });

  util.parallel(
      suiteRunners, config.get('numConcurrentSuites'), function(error) {
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
function _runMocha(reporter: MultiReporter, done: () => void, waited: boolean) {
  if (config.get('waitForFrameworks') && !waited) {
    const waitFor =
        (config.get('waitFor') || util.whenFrameworksReady).bind(window);
    waitFor(function() {
      _fixCustomElements();
      _runMocha(reporter, done, true);
    });
    return;
  }
  util.debug('_runMocha');
  const mocha = window.mocha;
  const Mocha = window.Mocha;

  mocha.reporter(reporter.childReporter(window.location));
  mocha.suite.title = reporter.suiteTitle(window.location);
  mocha.grep(GREP);

  // We can't use `mocha.run` because it bashes over grep, invert, and friends.
  // See https://github.com/visionmedia/mocha/blob/master/support/tail.js#L137
  const runner = Mocha.prototype.run.call(mocha, function(_error: any) {
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
      if (!event.error)
        return;
      if (event.error.ignore)
        return;
      runner.uncaught(event.error);
    });
  }
}
/**
 * In Chrome57 custom elements in the document might not get upgraded when
 * there is a high GC
 * https://bugs.chromium.org/p/chromium/issues/detail?id=701601 We clone and
 * replace the ones that weren't upgraded.
 */
function _fixCustomElements() {
  // Bail out if it is not Chrome 57.
  const raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
  const isM57 = raw && raw[2] === '57';
  if (!isM57)
    return;

  const elements = document.body.querySelectorAll('*:not(script):not(style)');
  const constructors = {};
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    // This child has already been cloned and replaced by its parent, skip it!
    if (!el.isConnected)
      continue;

    const tag = el.localName;
    // Not a custom element!
    if (tag.indexOf('-') === -1)
      continue;

    // Memoize correct constructors.
    constructors[tag] =
        constructors[tag] || document.createElement(tag).constructor;
    // This one was correctly upgraded.
    if (el instanceof constructors[tag])
      continue;

    util.debug('_fixCustomElements: found non-upgraded custom element ' + el);
    const clone = document.importNode(el, true);
    el.parentNode.replaceChild(clone, el);
  }
}
