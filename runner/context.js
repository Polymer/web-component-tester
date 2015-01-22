/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var _      = require('lodash');
var async  = require('async');
var events = require('events');
var path   = require('path');
var util   = require('util');

var config = require('./config');

/**
 * Exposes the current state of a WCT run, and emits events/hooks for anyone
 * downstream to listen to.
 *
 * @param {Object} options Any initially specified options.
 */
function Context(options) {
  /** The configuration for the current WCT run. */
  this.options = config.merge(config.defaults(), options || {});

  /** @type {!Object<string, !Array<function>>} */
  this._hookHandlers = {};

  /** @type {!Object<string, {handler: function, metadata: !Object}>} */
  this._plugins = {};
}
util.inherits(Context, events.EventEmitter);

// Hooks
//
// In addition to emitting events, a context also exposes "hooks" that
// interested parties can use to inject behavior.

/**
 * Registers a handler for a particular hook. Hooks are typically configured to
 * run _before_ a particular behavior.
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
  this._hookHandlers[name].unshift(handler);
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
  this._hookHandlers[name].push(handler);
};

/**
 * Once all registered handlers have run for the hook, your callback will be
 * triggered. If any of the handlers indicates an error state, any subsequent
 * handlers will be canceled, and the error will be passed to the callback for
 * the hook.
 *
 * Any additional arguments passed between `name` and `done` will be passed to
 * hooks (between `options` and before the callback).
 *
 * @param {string} name
 * @param {function(*)} done
 * @return {!Context}
 */
Context.prototype.emitHook = function emitHook(name, done) {
  this.emit('log:debug', 'hook:', name);

  var hookArgs = [null, this.options];  // Passed to `Function#bind`.
  if (arguments.length > 2) {
    hookArgs = hookArgs.concat(Array.prototype.slice(1, arguments.length - 1));
    done = arguments[arguments.length - 1];
  }

  var hooks = (this._hookHandlers[name] || []).map(function(hook) {
    return hook.bind.apply(hook, hookArgs);
  });

  // We execute the handlers _sequentially_. This may be slower, but it gives us
  // a lighter cognitive load and more obvious logs.
  async.series(hooks, function(error) {
    if (error) {
      this.emit('log:debug', 'hook done:', name, 'with error:', error);
    } else {
      this.emit('log:debug', 'hook done:', name);
    }
    done(error);
  }.bind(this));

  return this;
};

// Plugin Loading

// When loading modules, we try to load them with the following prefixes first.
var PREFIX_ORDER = [
  'web-component-tester-',
  'wct-',
];

/**
 * Loads and returns handler and metadata for the plugins requested via
 * `options.plugins`.
 *
 * @param {function(*, !Object<string, {handler: function, metadata: !Object}>)}
 */
Context.prototype.discoverPlugins = function discoverPlugins(done) {
  var missing = _.difference(_.keys(this.options.plugins), _.keys(this._plugins));
  for (var i = 0, name; name = missing[i]; i++) {
    var plugin = _loadPlugin(name);
    if (!plugin) {
      return done('Unknown WCT plugin "' + name + '". Did you forget to npm install wct-' + name + '?');
    }
    this._plugins[name] = plugin;
  }

  done(null, this._plugins);
};

function _loadPlugin(name) {
  // Is the name already prefixed?
  var prefixed = _.any(PREFIX_ORDER, function(p) { return name.indexOf(p) === 0 });
  if (!prefixed) {
    for (var i = 0, prefix; prefix = PREFIX_ORDER[i]; i++) {
      var plugin = _loadPlugin(prefix + name);
      if (plugin) {
        plugin.name = name;
        return plugin;
      }
    }
  }

  // We either have a prefixed plugin, or failed to load one.
  var package;
  try {
    package = require(path.join(name, 'package.json'));
  } catch (error) {
    return null;
  }

  // Plugins must have a wct-plugin field.
  if (!package['wct-plugin']) return null;

  return {
    name:     name,
    fullName: name,
    metadata: package['wct-plugin'],
    handler:  require(name),
  };
}

module.exports = Context;
