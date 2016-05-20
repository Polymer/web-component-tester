/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as util from './util.js';

// TODO(thedeeno): Consider renaming subsuite. IIRC, childRunner is entirely
// distinct from mocha suite, which tripped me up badly when trying to add
// plugin support. Perhaps something like 'batch', or 'bundle'. Something that
// has no mocha correlate. This may also eliminate the need for root/non-root
// suite distinctions.

/**
 * A Mocha suite (or suites) run within a child iframe, but reported as if they
 * are part of the current context.
 */
export default function ChildRunner(url, parentScope) {
  var urlBits = util.parseUrl(url);
  util.mergeParams(
      urlBits.params, util.getParams(parentScope.location.search));
  delete urlBits.params.cli_browser_id;

  this.url         = urlBits.base + util.paramsToQuery(urlBits.params);
  this.parentScope = parentScope;

  this.state = 'initializing';
}

// ChildRunners get a pretty generous load timeout by default.
ChildRunner.loadTimeout = 60000;

// We can't maintain properties on iframe elements in Firefox/Safari/???, so we
// track childRunners by URL.
ChildRunner._byUrl = {};

/**
 * @return {ChildRunner} The `ChildRunner` that was registered for this window.
 */
ChildRunner.current = function() {
  return ChildRunner.get(window);
};

/**
 * @param {!Window} target A window to find the ChildRunner of.
 * @param {boolean} traversal Whether this is a traversal from a child window.
 * @return {ChildRunner} The `ChildRunner` that was registered for `target`.
 */
ChildRunner.get = function(target, traversal) {
  var childRunner = ChildRunner._byUrl[target.location.href];
  if (childRunner) return childRunner;
  if (window.parent === window) {  // Top window.
    if (traversal) {
      console.warn('Subsuite loaded but was never registered. This most likely is due to wonky history behavior. Reloading...');
      window.location.reload();
    }
    return null;
  }
  // Otherwise, traverse.
  return window.parent.WCT._ChildRunner.get(target, true);
};

/**
 * Loads and runs the subsuite.
 *
 * @param {function} done Node-style callback.
 */
ChildRunner.prototype.run = function(done) {
  util.debug('ChildRunner#run', this.url);
  this.state = 'loading';
  this.onRunComplete = done;

  this.iframe = document.createElement('iframe');
  this.iframe.src = this.url;
  this.iframe.classList.add('subsuite');

  var container = document.getElementById('subsuites');
  if (!container) {
    container = document.createElement('div');
    container.id = 'subsuites';
    document.body.appendChild(container);
  }
  container.appendChild(this.iframe);

  // let the iframe expand the URL for us.
  this.url = this.iframe.src;
  ChildRunner._byUrl[this.url] = this;

  this.timeoutId = setTimeout(
      this.loaded.bind(this, new Error('Timed out loading ' + this.url)), ChildRunner.loadTimeout);

  this.iframe.addEventListener('error',
      this.loaded.bind(this, new Error('Failed to load document ' + this.url)));

  this.iframe.contentWindow.addEventListener('DOMContentLoaded', this.loaded.bind(this, null));
};

/**
 * Called when the sub suite's iframe has loaded (or errored during load).
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.loaded = function(error) {
  util.debug('ChildRunner#loaded', this.url, error);

  // Not all targets have WCT loaded (compatiblity mode)
  if (this.iframe.contentWindow.WCT) {
    this.share = this.iframe.contentWindow.WCT.share;
  }

  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/**
 * Called in mocha/run.js when all dependencies have loaded, and the child is
 * ready to start running tests
 *
 * @param {*} error The error that occured, if any.
 */
ChildRunner.prototype.ready = function(error) {
  util.debug('ChildRunner#ready', this.url, error);
  if (this.timeoutId) {
    clearTimeout(this.timeoutId);
  }
  if (error) {
    this.signalRunComplete(error);
    this.done();
  }
};

/** Called when the sub suite's tests are complete, so that it can clean up. */
ChildRunner.prototype.done = function done() {
  util.debug('ChildRunner#done', this.url, arguments);

  // make sure to clear that timeout
  this.ready();
  this.signalRunComplete();

  if (!this.iframe) return;
  // Be safe and avoid potential browser crashes when logic attempts to interact
  // with the removed iframe.
  setTimeout(function() {
    this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
  }.bind(this), 1);
};

ChildRunner.prototype.signalRunComplete = function signalRunComplete(error) {
  if (!this.onRunComplete) return;
  this.state = 'complete';
  this.onRunComplete(error);
  this.onRunComplete = null;
};
