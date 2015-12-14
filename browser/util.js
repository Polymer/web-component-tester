/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as config from './config.js';

/**
 * @param {function()} callback A function to call when the active web component
 *     frameworks have loaded.
 */
export function whenFrameworksReady(callback) {
  debug('whenFrameworksReady');
  var done = function() {
    debug('whenFrameworksReady done');
    callback();
  };

  function whenWebComponentsReady() {
    debug('WebComponentsReady?');
    if (window.WebComponents && WebComponents.whenReady) {
      WebComponents.whenReady(function() {
        debug('WebComponents Ready');
        done();
      });
    } else {
      var after = function after() {
        window.removeEventListener('WebComponentsReady', after);
        debug('WebComponentsReady');
        done();
      };
      window.addEventListener('WebComponentsReady', after);
    }
  }

  function importsReady() {
    // handle Polymer 0.5 readiness
    debug('Polymer ready?');
    if (window.Polymer && Polymer.whenReady) {
      Polymer.whenReady(function() {
        debug('Polymer ready');
        done();
      });
    } else {
      whenWebComponentsReady();
    }
  }

  // All our supported framework configurations depend on imports.
  if (!window.HTMLImports) {
    done();
  } else if (HTMLImports.ready) {
    debug('HTMLImports ready');
    importsReady();
  } else if (HTMLImports.whenReady) {
    HTMLImports.whenReady(function() {
      debug('HTMLImports.whenReady ready');
      importsReady();
    });
  } else {
    whenWebComponentsReady();
  }
}

/**
 * @param {number} count
 * @param {string} kind
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
export function pluralizedStat(count, kind) {
  if (count === 1) {
    return count + ' ' + kind + ' test';
  } else {
    return count + ' ' + kind + ' tests';
  }
}

/**
 * @param {string} path The URI of the script to load.
 * @param {function} done
 */
export function loadScript(path, done) {
  var script = document.createElement('script');
  script.src = path;
  if (done) {
    script.onload = done.bind(null, null);
    script.onerror = done.bind(null, 'Failed to load script ' + script.src);
  }
  document.head.appendChild(script);
}

/**
 * @param {string} path The URI of the stylesheet to load.
 * @param {function} done
 */
export function loadStyle(path, done) {
  var link = document.createElement('link');
  link.rel  = 'stylesheet';
  link.href = path;
  if (done) {
    link.onload = done.bind(null, null);
    link.onerror = done.bind(null, 'Failed to load stylesheet ' + link.href);
  }
  document.head.appendChild(link);
}

/**
 * @param {...*} var_args Logs values to the console when the `debug`
 *     configuration option is true.
 */
export function debug(var_args) {
  if (!config.get('verbose')) return;
  var args = [window.location.pathname];
  args.push.apply(args, arguments);
  (console.debug || console.log).apply(console, args);
}

// URL Processing

/**
 * @param {string} url
 * @return {{base: string, params: string}}
 */
export function parseUrl(url) {
  var parts = url.match(/^(.*?)(?:\?(.*))?$/);
  return {
    base:   parts[1],
    params: getParams(parts[2] || ''),
  };
}

/**
 * Expands a URL that may or may not be relative to `base`.
 *
 * @param {string} url
 * @param {string} base
 * @return {string}
 */
export function expandUrl(url, base) {
  if (!base) return url;
  if (url.match(/^(\/|https?:\/\/)/)) return url;
  if (base.substr(base.length - 1) !== '/') {
    base = base + '/';
  }
  return base + url;
}

/**
 * @param {string=} opt_query A query string to parse.
 * @return {!Object<string, !Array<string>>} All params on the URL's query.
 */
export function getParams(opt_query) {
  var query = typeof opt_query === 'string' ? opt_query : window.location.search;
  if (query.substring(0, 1) === '?') {
    query = query.substring(1);
  }
  // python's SimpleHTTPServer tacks a `/` on the end of query strings :(
  if (query.slice(-1) === '/') {
    query = query.substring(0, query.length - 1);
  }
  if (query === '') return {};

  var result = {};
  query.split('&').forEach(function(part) {
    var pair = part.split('=');
    if (pair.length !== 2) {
      console.warn('Invalid URL query part:', part);
      return;
    }
    var key   = decodeURIComponent(pair[0]);
    var value = decodeURIComponent(pair[1]);

    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(value);
  });

  return result;
}

/**
 * Merges params from `source` into `target` (mutating `target`).
 *
 * @param {!Object<string, !Array<string>>} target
 * @param {!Object<string, !Array<string>>} source
 */
export function mergeParams(target, source) {
  Object.keys(source).forEach(function(key) {
    if (!(key in target)) {
      target[key] = [];
    }
    target[key] = target[key].concat(source[key]);
  });
}

/**
 * @param {string} param The param to return a value for.
 * @return {?string} The first value for `param`, if found.
 */
export function getParam(param) {
  var params = getParams();
  return params[param] ? params[param][0] : null;
}

/**
 * @param {!Object<string, !Array<string>>} params
 * @return {string} `params` encoded as a URI query.
 */
export function paramsToQuery(params) {
  var pairs = [];
  Object.keys(params).forEach(function(key) {
    params[key].forEach(function(value) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
  });
  return (pairs.length > 0) ? ('?' + pairs.join('&')) : '';
}

/**
 * @param {!Location|string} location
 * @return {string}
 */
export function basePath(location) {
  return (location.pathname || location).match(/^.*\//)[0];
}

/**
 * @param {!Location|string} location
 * @param {string} basePath
 * @return {string}
 */
export function relativeLocation(location, basePath) {
  var path = location.pathname || location;
  if (path.indexOf(basePath) === 0) {
    path = path.substring(basePath.length);
  }
  return path;
}

/**
 * @param {!Location|string} location
 * @return {string}
 */
export function cleanLocation(location) {
  var path = location.pathname || location;
  if (path.slice(-11) === '/index.html') {
    path = path.slice(0, path.length - 10);
  }
  return path;
}

/**
 * Like `async.parallelLimit`, but our own so that we don't force a dependency
 * on downstream code.
 *
 * @param {!Array<function(function(*))>} runners Runners that call their given
 *     Node-style callback when done.
 * @param {number|function(*)} limit Maximum number of concurrent runners.
 *     (optional).
 * @param {?function(*)} done Callback that should be triggered once all runners
 *     have completed, or encountered an error.
 */
export function parallel(runners, limit, done) {
  if (typeof limit !== 'number') {
    done  = limit;
    limit = 0;
  }
  if (!runners.length) return done();

  var called    = false;
  var total     = runners.length;
  var numActive = 0;
  var numDone   = 0;

  function runnerDone(error) {
    if (called) return;
    numDone = numDone + 1;
    numActive = numActive - 1;

    if (error || numDone >= total) {
      called = true;
      done(error);
    } else {
      runOne();
    }
  }

  function runOne() {
    if (limit && numActive >= limit) return;
    if (!runners.length) return;
    numActive = numActive + 1;
    runners.shift()(runnerDone);
  }
  runners.forEach(runOne);
}

/**
 * Finds the directory that a loaded script is hosted on.
 *
 * @param {string} filename
 * @return {string?}
 */
export function scriptPrefix(filename) {
  var scripts = document.querySelectorAll('script[src*="' + filename + '"]');
  if (scripts.length !== 1) return null;
  var script = scripts[0].src;
  return script.substring(0, script.indexOf(filename));
}
