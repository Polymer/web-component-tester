/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var async  = require('async');
var events = require('events');
var util   = require('util');

/**
 * Exposes the current state of a WCT run, and emits events/hooks for anyone
 * downstream to listen to.
 *
 * @param {Object} options Any initially specified options.
 */
function Context(options) {
  /** The configuration for the current WCT run. */
  this.options = options || {};

  /** @type {!Object<string, !Array<function>>} */
  this._hookHandlers = {};
}
util.inherits(Context, events.EventEmitter);

// Hooks
//
// In addition to emitting events, a context also exposes "hooks" that
// interested parties can use to inject behavior.

/**
 * Registers a handler for a particular hook.
 *
 * As a convenience, the handler is provided the `options` object as its first
 * argument. The second is a done callback.
 *
 * @param {string} name
 * @param {function(!Object, function(*))} handler
 * @return {!Context}
 */
Context.prototype.hook = function hook(name, handler) {
  this._hookHandlers[name] = this._hookHandlers[name] || [];
  this._hookHandlers[name].unshift(handler.bind(null, this.options));
};

/**
 * Registers a handler that will run after any handlers registered by `hook`.
 *
 * @param {string} name
 * @param {function(!Object, function(*))} handler
 * @return {!Context}
 */
Context.prototype.hookLate = function hookLate(name, handler) {
  this._hookHandlers[name] = this._hookHandlers[name] || [];
  this._hookHandlers[name].push(handler.bind(null, this.options));
};

/**
 * Once all registered handlers have run for the hook, your callback will be
 * triggered. If any of the handlers indicates an error state, any subsequent
 * handlers will be canceled, and the error will be passed to the callback for
 * the hook.
 *
 * @param {string} name
 * @param {function(*)} done
 * @return {!Context}
 */
Context.prototype.emitHook = function emitHook(name, done) {
  this.emit('log:debug', 'hook:', name);
  // We execute the handlers _sequentially_. This may be slower, but it gives us
  // a lighter cognitive load and more obvious logs.
  async.series(this._hookHandlers[name] || [], function(error) {
    if (error) {
      this.emit('log:debug', 'hook done:', name, 'with error:', error);
    } else {
      this.emit('log:debug', 'hook done:', name);
    }
    done(error);
  }.bind(this));

  return this;
};

module.exports = Context;
