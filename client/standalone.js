// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

// We expose all Mocha methods up front, configuring and running mocha
// automatically when you call them.
//
// The assumption is that it is a one-off (sub-)suite of tests being run.
Object.keys(WCT.Util.MochaExports).forEach(function(ui) {
  WCT.Util.MochaExports[ui].forEach(function(key) {
    window[key] = function wrappedMochaFunction() {
      setupAndRunAsync(ui);
      if (!window[key] || window[key] === wrappedMochaFunction) {
        throw new Error('Expected mocha.setup to define ' + key);
      }
      window[key].apply(window, arguments);
    }
  });
});

var chosenUI;

/**
 *
 */
function setupAndRunAsync(ui) {
  if (chosenUI && chosenUI === ui) return;
  if (chosenUI && chosenUI !== ui) {
    throw new Error('Mixing ' + chosenUI + ' and ' + ui + ' Mocha styles is not supported.');
  }
  mocha.setup({ui: ui, reporter: WCT.ConsoleReporter});
  async.nextTick(function() {
    WCT.Util.whenFrameworksReady(mocha.run.bind(mocha));
  });
}

})();
