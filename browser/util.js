/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
(function() {

WCT.util = {};

/**
 * @param {function()} done A function to call when the active web component
 *     frameworks have loaded.
 */
WCT.util.whenFrameworksReady = function(done) {
  var handlers = [];
  if (window.HTMLImports && window.HTMLImports.whenReady) {
    handlers.push(window.HTMLImports.whenReady.bind(window.HTMLImports));
  }
  if (window.Polymer && window.Polymer.whenReady) {
    handlers.push(window.Polymer.whenReady.bind(window.Polymer));
  }

  async.parallel(handlers, function() {
    // Platform isn't quite ready for IE10.
    // TODO(nevir): Should this be baked into platform ready?
    asyncPlatformFlush(done);
  });
};

/**
 * @param {number} count
 * @param {string} kind
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
WCT.util.pluralizedStat = function pluralizedStat(count, kind) {
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
WCT.util.getParam = function getParam(param) {
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
WCT.util.loadScript = function loadScript(path, done) {
  var script = document.createElement('script');
  script.src = path + '?' + Math.random();
  script.onload = done.bind(null, null);
  script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  document.head.appendChild(script);
}

/** @return {string} `location` relative to the current window. */
WCT.util.relativeLocation = function relativeLocation(location) {
  var path = location.pathname;
  if (path.indexOf(window.location.pathname) === 0) {
    path = path.substr(window.location.pathname.length);
  }
  return path;
}

/**
 *
 */
WCT.util.debug = function debug(var_args) {
  if (!WCT.debug) return;
  console.debug.apply(console, arguments);
}

})();
