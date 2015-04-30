/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as config from '../config.js';

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

/**
 * Exposes all Mocha methods up front, configuring and running mocha
 * automatically when you call them.
 *
 * The assumption is that it is a one-off (sub-)suite of tests being run.
 */
export function stubInterfaces() {
  Object.keys(MOCHA_EXPORTS).forEach(function(ui) {
    MOCHA_EXPORTS[ui].forEach(function(key) {
      window[key] = function wrappedMochaFunction() {
        _setupMocha(ui);
        if (!window[key] || window[key] === wrappedMochaFunction) {
          throw new Error('Expected mocha.setup to define ' + key);
        }
        window[key].apply(window, arguments);
      };
    });
  });
}

/**
 * @param {string} ui Sets up mocha to run `ui`-style tests.
 */
function _setupMocha(ui) {
  var mochaOptions = config.get('mochaOptions');
  if (mochaOptions.ui && mochaOptions.ui === ui) return;
  if (mochaOptions.ui && mochaOptions.ui !== ui) {
    throw new Error('Mixing ' + mochaOptions.ui + ' and ' + ui + ' Mocha styles is not supported.');
  }
  mochaOptions.ui = ui;
  mocha.setup(mochaOptions);  // Note that the reporter is configured in run.js.
};
