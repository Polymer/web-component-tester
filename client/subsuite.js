// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

// TODO(nevir): Support BDD style too.
// https://github.com/visionmedia/mocha/blob/master/lib/interfaces/tdd.js
var MOCHA_EXPORTS = [
  'setup',
  'teardown',
  'suiteSetup',
  'suiteTeardown',
  'suite',
  'test',
];

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
function SubSuite(name, parentScope) {
  this.name        = name;
  this.parentScope = parentScope;
}
WCT.SubSuite = SubSuite;

/**
 * @param {string} name The name of the child document to register.
 * @param {!HTMLIFrameElement} iframe The iframe containing the child document.
 */
SubSuite.register = function register(name, iframe) {
  var subSuite = new this(name, window);
  iframe.subSuite = subSuite;
};

/**
 * @param {!Window} window The window to retrieve a `SubSuite` for.
 * @return {SubSuite} The `SubSuite` that was registered for this window.
 */
SubSuite.get = function(window) {
  return window.frameElement && window.frameElement.subSuite || null;
}

/**
 * Injects Mocha's global functions into an object scope.
 *
 * @param {!Object} scope
 */
SubSuite.prototype.inject = function(scope) {
  for (var i = 0, key; key = MOCHA_EXPORTS[i]; i++) {
    scope[key] = this.parentScope[key];
  }
};

// If we are within a sub suite, we want to inject Mocha's functions as early as
// possible.
var thisSubSuite = SubSuite.get(window);
if (thisSubSuite) {
  thisSubSuite.inject(window);
}

})();
