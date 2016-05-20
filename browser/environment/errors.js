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

// We may encounter errors during initialization (for example, syntax errors in
// a test file). Hang onto those (and more) until we are ready to report them.
export var globalErrors = [];

/**
 * Hook the environment to pick up on global errors.
 */
export function listenForErrors() {
  window.addEventListener('error', function(event) {
    globalErrors.push(event.error);
  });

  // Also, we treat `console.error` as a test failure. Unless you prefer not.
  var origConsole = console;
  var origError   = console.error;
  console.error = function wctShimmedError() {
    origError.apply(origConsole, arguments);
    if (config.get('trackConsoleError')) {
      throw 'console.error: ' + Array.prototype.join.call(arguments, ' ');
    }
  };
}
