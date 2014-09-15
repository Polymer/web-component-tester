// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

/**
 * If you set up a suite before `mocha.setup`, we assume that this is a one-off
 * test, and just run it for you.
 *
 * This is bashed over by `mocha.setup`.
 *
 * @param {...*} var_args The regular arguments for Mocha's `suite`.
 */
window.suite = function suite(var_args) {
  mocha.setup({ui: 'tdd', reporter: WCT.ConsoleReporter});
  window.suite.apply(window, arguments);
  // TODO(nevir): Defer til after Polymer load.
  mocha.run();
};

})();
