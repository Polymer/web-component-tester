// Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
// This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
// The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
// The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
// Code distributed by Google as part of the polymer project is also
// subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
(function() {

WCT.Util = {};

/**
 * @param {function()} done A function to call when the active web component
 *     frameworks have loaded.
 * @param {Window} opt_scope A scope to check for polymer within.
 */
WCT.Util.whenFrameworksReady = function(done, opt_scope) {
  var scope = opt_scope || window;
  // TODO(nevir): Frameworks other than Polymer?
  if (!scope.Polymer) return done();

  // Platform isn't quite ready for IE10.
  // TODO(nevir): Should this be baked into platform ready?
  done = asyncPlatformFlush.bind(null, done);

  if (scope.Polymer.whenReady) {
    scope.Polymer.whenReady(done);
  } else {
    scope.addEventListener('polymer-ready', done);
  }
};

/**
 * @param {number} count
 * @param {string} kind
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
WCT.Util.pluralizedStat = function pluralizedStat(count, kind) {
  if (count === 1) {
    return count + ' ' + kind + ' test';
  } else {
    return count + ' ' + kind + ' tests';
  }
};

/**
 * @param {string} param The param to return a value for.
 * @return {?string} The first value for `param`, if found.
 */
WCT.Util.getParam = function getParam(param) {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i=0;i<vars.length;i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) === param) {
      return decodeURIComponent(pair[1]);
    }
  }
  return null;
};

/**
 * @param {string} path The URI of the script to load.
 * @param {function} done
 */
WCT.Util.loadScript = function loadScript(path, done) {
  var script = document.createElement('script');
  script.src = path;
  script.onload = done.bind(null, null);
  script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  document.head.appendChild(script);
}

})();
