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
function SubSuite(url, parentScope) {
  this.url         = url + '?' + Math.random();
  this.parentScope = parentScope;
}
WCT.SubSuite = SubSuite;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track subSuites by URL.
SubSuite._byUrl = {};

/**
 * Loads a HTML document containing Mocha suites that should be injected into
 * the current Mocha environment.
 *
 * @param {string} url The URL of the document to load.
 * @param {function} done Node-style callback, given the sub suite as the
 *     second argument.
 */
SubSuite.load = function load(url, done) {
  var subSuite = new this(url, window);
  subSuite.load(function(error) {
    done(error, subSuite);
  });
};

/**
 * @return {SubSuite} The `SubSuite` that was registered for this window.
 */
SubSuite.current = function() {
  return SubSuite.get(window);
}

/**
 * @param {!Window} target A window to find the SubSuite of.
 * @return {SubSuite} The `SubSuite` that was registered for `target`.
 */
SubSuite.get = function(target) {
  var subSuite = SubSuite._byUrl[target.location.href];
  if (subSuite || window.parent === window) return subSuite;
  // Otherwise, traverse.
  return window.parent.WCT.SubSuite.get(target);
}

/**
 * Loads the subsuite.
 *
 * @param {function} done Node-style callback.
 */
SubSuite.prototype.load = function(done) {
  this.iframe = document.createElement('iframe');
  this.iframe.src = this.url;
  this.iframe.classList.add('subsuite');
  document.body.appendChild(this.iframe);

  // let the iframe expand the URL for us.
  this.url = this.iframe.src;
  SubSuite._byUrl[this.url] = this;

  this.iframe.addEventListener('error', done.bind(null, 'Failed to load document ' + this.url));
  this.iframe.contentWindow.addEventListener('DOMContentLoaded', done);
};

/** Called when the sub suite's tests are complete, so that it can clean up. */
SubSuite.prototype.done = function done() {
  this.iframe.parentNode.removeChild(this.iframe);
};

})();
