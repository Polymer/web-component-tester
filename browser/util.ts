/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as config from './config.js';

/**
 * @param {function()} callback A function to call when the active web component
 *     frameworks have loaded.
 */
export function whenFrameworksReady(callback: () => void) {
  debug('whenFrameworksReady');
  const done = function() {
    debug('whenFrameworksReady done');
    callback();
  };

  // If webcomponents script is in the document, wait for WebComponentsReady.
  if (window.WebComponents && !window.WebComponents.ready) {
    debug('WebComponentsReady?');
    window.addEventListener('WebComponentsReady', function wcReady() {
      window.removeEventListener('WebComponentsReady', wcReady);
      debug('WebComponentsReady');
      done();
    });
  } else {
    done();
  }
}

/**
 * @return {string} '<count> <kind> tests' or '<count> <kind> test'.
 */
export function pluralizedStat(count: number, kind: string): string {
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
export function loadScript(path: string, done: (error?: any) => void) {
  const script = document.createElement('script');
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
export function loadStyle(path: string, done?: () => void) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
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
export function debug(...var_args: any[]) {
  if (!config.get('verbose')) {
    return;
  }
  const args = [window.location.pathname, ...var_args];
  (console.debug || console.log).apply(console, args);
}

// URL Processing

/**
 * @param {string} url
 * @return {{base: string, params: string}}
 */
export function parseUrl(url: string) {
  const parts = url.match(/^(.*?)(?:\?(.*))?$/);
  return {
    base: parts[1],
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
export function expandUrl(url: string, base: string) {
  if (!base)
    return url;
  if (url.match(/^(\/|https?:\/\/)/))
    return url;
  if (base.substr(base.length - 1) !== '/') {
    base = base + '/';
  }
  return base + url;
}

export interface Params { [param: string]: string[]; }

/**
 * @param {string=} opt_query A query string to parse.
 * @return {!Object<string, !Array<string>>} All params on the URL's query.
 */
export function getParams(query?: string): Params {
  query = typeof query === 'string' ? query : window.location.search;
  if (query.substring(0, 1) === '?') {
    query = query.substring(1);
  }
  // python's SimpleHTTPServer tacks a `/` on the end of query strings :(
  if (query.slice(-1) === '/') {
    query = query.substring(0, query.length - 1);
  }
  if (query === '')
    return {};

  const result: {[param: string]: string[]} = {};
  query.split('&').forEach(function(part) {
    const pair = part.split('=');
    if (pair.length !== 2) {
      console.warn('Invalid URL query part:', part);
      return;
    }
    const key = decodeURIComponent(pair[0]);
    const value = decodeURIComponent(pair[1]);

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
export function mergeParams(target: Params, source: Params) {
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
export function getParam(param: string): string|null {
  const params = getParams();
  return params[param] ? params[param][0] : null;
}

/**
 * @param {!Object<string, !Array<string>>} params
 * @return {string} `params` encoded as a URI query.
 */
export function paramsToQuery(params: Params): string {
  const pairs: string[] = [];
  Object.keys(params).forEach(function(key) {
    params[key].forEach(function(value) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
  });
  return (pairs.length > 0) ? ('?' + pairs.join('&')) : '';
}

function getPathName(location: Location|string): string {
  return typeof location === 'string' ? location : location.pathname;
}

export function basePath(location: Location|string) {
  return getPathName(location).match(/^.*\//)[0];
}

export function relativeLocation(location: Location|string, basePath: string) {
  let path = getPathName(location);
  if (path.indexOf(basePath) === 0) {
    path = path.substring(basePath.length);
  }
  return path;
}

export function cleanLocation(location: Location|string) {
  let path = getPathName(location);
  if (path.slice(-11) === '/index.html') {
    path = path.slice(0, path.length - 10);
  }
  return path;
}

export type Runner = (f: Function) => void;

/**
 * Like `async.parallelLimit`, but our own so that we don't force a dependency
 * on downstream code.
 *
 * @param runners Runners that call their given
 *     Node-style callback when done.
 * @param {number|function(*)} limit Maximum number of concurrent runners.
 *     (optional).
 * @param {?function(*)} done Callback that should be triggered once all runners
 *     have completed, or encountered an error.
 */
export function parallel(runners: Runner[], done: (error?: any) => void): void;
export function parallel(
    runners: Runner[], limit: number, done: (error?: any) => void): void;
export function parallel(
    runners: Runner[], maybeLimit: number|((error?: any) => void),
    done?: (error?: any) => void) {
  let limit: number;
  if (typeof maybeLimit !== 'number') {
    done = maybeLimit;
    limit = 0;
  } else {
    limit = maybeLimit;
  }
  if (!runners.length) {
    return done();
  }

  let called = false;
  const total = runners.length;
  let numActive = 0;
  let numDone = 0;

  function runnerDone(error: any) {
    if (called) {
      return;
    }
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
    if (limit && numActive >= limit) {
      return;
    }
    if (!runners.length) {
      return;
    }
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
export function scriptPrefix(filename: string): string|null {
  const scripts =
      document.querySelectorAll('script[src*="' + filename + '"]') as
      NodeListOf<HTMLScriptElement>;
  if (scripts.length !== 1) {
    return null;
  }
  const script = scripts[0].src;
  return script.substring(0, script.indexOf(filename));
}
