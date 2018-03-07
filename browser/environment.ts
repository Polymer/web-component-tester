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
import * as config from './config.js';
import * as reporters from './reporters.js';
import * as util from './util.js';

/**
 * Loads all environment scripts ...synchronously ...after us.
 */
export function loadSync() {
  util.debug('Loading environment scripts:');
  const a11ySuiteScriptPath = 'web-component-tester/data/a11ySuite.js';
  const scripts = config.get('environmentScripts');
  const a11ySuiteWillBeLoaded =
      window.__generatedByWct || scripts.indexOf(a11ySuiteScriptPath) > -1;

  // We can't inject a11ySuite when running the npm version because it is a
  // module-based script that needs `<script type=module>` and compilation
  // for browsers without module support.
  if (!a11ySuiteWillBeLoaded && !window.__wctUseNpm) {
    // wct is running as a bower dependency, load a11ySuite from data/
    scripts.push(a11ySuiteScriptPath);
  }
  scripts.forEach(function(path) {
    const url = util.expandUrl(path, config.get('root'));
    util.debug('Loading environment script:', url);
    // Synchronous load.
    document.write(
        '<script src="' + encodeURI(url) +
        '"></script>');  // jshint ignore:line
  });
  util.debug('Environment scripts loaded');

  const imports = config.get('environmentImports');
  imports.forEach(function(path) {
    const url = util.expandUrl(path, config.get('root'));
    util.debug('Loading environment import:', url);
    // Synchronous load.
    document.write(
        '<link rel="import" href="' + encodeURI(url) +
        '">');  // jshint ignore:line
  });
  util.debug('Environment imports loaded');
}

/**
 * We have some hard dependencies on things that should be loaded via
 * `environmentScripts`, so we assert that they're present here; and do any
 * post-facto setup.
 */
export function ensureDependenciesPresent() {
  _ensureMocha();
  _checkChai();
}

function _ensureMocha() {
  const Mocha = window.Mocha;
  if (!Mocha) {
    throw new Error(
        'WCT requires Mocha. Please ensure that it is present in WCT.environmentScripts, or that you load it before loading web-component-tester/browser.js');
  }
  reporters.injectMocha(Mocha);
  // Magic loading of mocha's stylesheet
  const mochaPrefix = util.scriptPrefix('mocha.js');
  // only load mocha stylesheet for the test runner output
  // Not the end of the world, if it doesn't load.
  if (mochaPrefix && window.top === window.self) {
    util.loadStyle(mochaPrefix + 'mocha.css');
  }
}

function _checkChai() {
  if (!window.chai) {
    util.debug('Chai not present; not registering shorthands');
    return;
  }

  window.assert = window.chai.assert;
  window.expect = window.chai.expect;
}
