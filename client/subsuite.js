// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

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
 * Loads a HTML document containing Mocha suites that should be injected into
 * the current Mocha environment.
 *
 * @param {string} url The URL of the document to load.
 * @param {function} done Node-style callback.
 */
SubSuite.load = function load(url, done) {
  var subSuite = new this(url, window);
  subSuite.onload = function(error) {
    subSuite.onload = null;
    done(error);
  };

  var iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.subSuite = subSuite;
  iframe.classList.add('subsuite');
  iframe.onerror = done.bind(null, 'Failed to load document ' + iframe.src);
  document.body.appendChild(iframe);
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
 * @param {!Window} scope
 */
SubSuite.prototype.inject = function(scope) {
  // TODO(nevir): Support more than just TDD.
  for (var i = 0, key; key = WCT.Util.MochaExports.tdd[i]; i++) {
    scope[key] = this.parentScope[key];
  }

  scope.addEventListener('error', function(error) {
    console.error('Load-time error in ' + this.name + ':', error.stack || error.message || error);
    this.onload(error);
  }.bind(this));

  // Because tests cannot be defined in the middle of a run, we cannot guarantee
  // that tests can be run prior to frameworks being ready.
  //
  // If you need to test logic prior to framework ready within `.html`
  // documents, your best bet is to run your tests outside of mocha.
  scope.addEventListener('load', function() {
    WCT.Util.whenFrameworksReady(this.onload);
  }.bind(this));
};

// If we are within a sub suite, we want to inject Mocha's functions as early as
// possible.
var thisSubSuite = SubSuite.get(window);
if (thisSubSuite) {
  thisSubSuite.inject(window);
}

})();
