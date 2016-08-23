/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import * as events from 'events';
import * as http from 'http';
import * as _ from 'lodash';
import * as socketIO from 'socket.io';
import * as util from 'util';

import {BrowserRunner} from './browserrunner';
import * as config from './config';
import {Plugin} from './plugin';

type Handler =
    ((...args: any[]) => Promise<any>)|((done: (err?: any) => void) => void)|
    ((arg1: any, done: (err?: any) => void) => void)|
    ((arg1: any, arg2: any, done: (err?: any) => void) => void)|
    ((arg1: any, arg2: any, arg3: any, done: (err?: any) => void) => void);

/**
 * Exposes the current state of a WCT run, and emits events/hooks for anyone
 * downstream to listen to.
 *
 * TODO(rictic): break back-compat with plugins by moving hooks entirely away
 *     from callbacks to promises. Easiest way to do this would be to rename
 *     the hook-related methods on this object, so that downstream callers would
 *     break in obvious ways.
 *
 * @param {Object} options Any initially specified options.
 */
export class Context extends events.EventEmitter {
  options: config.Config;
  private _hookHandlers: {[key: string]: Handler[]} = {};
  _socketIOServer: SocketIO.Server;
  _httpServer: http.Server;
  _testRunners: BrowserRunner[];

  constructor(options?: config.Config) {
    super();
    options = options || {};

    /**
     * The configuration for the current WCT run.
     *
     * We guarantee that this object is never replaced (e.g. you are free to
     * hold a reference to it, and make changes to it).
     */
    this.options = config.merge(
        config.defaults(),
        config.fromDisk(options.enforceJsonConf, options.root), options);
  }

  // Hooks
  //
  // In addition to emitting events, a context also exposes "hooks" that
  // interested parties can use to inject behavior.

  /**
   * Registers a handler for a particular hook. Hooks are typically configured
   * to run _before_ a particular behavior.
   */
  hook(name: string, handler: Handler) {
    this._hookHandlers[name] = this._hookHandlers[name] || [];
    this._hookHandlers[name].unshift(handler);
  };

  /**
   * Registers a handler that will run after any handlers registered so far.
   *
   * @param {string} name
   * @param {function(!Object, function(*))} handler
   */
  hookLate(name: string, handler: Handler) {
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
   * hooks (before the callback).
   *
   * @param {string} name
   * @param {function(*)} done
   * @return {!Context}
   */
  emitHook(
      name: 'prepare:webserver', app: Express.Application,
      done: (err?: any) => void): Promise<void>;
  emitHook(name: 'configure', done: (err?: any) => void): Promise<void>;
  emitHook(name: 'prepare', done: (err?: any) => void): Promise<void>;
  emitHook(name: 'cleanup', done: (err?: any) => void): Promise<void>;
  emitHook(name: string, done: (err?: any) => void): Promise<void>;
  emitHook(name: string, ...args: any[]): Promise<void>;
  async emitHook(name: string, done: (err?: any) => void): Promise<void> {
    this.emit('log:debug', 'hook:', name);

    const hooks = (this._hookHandlers[name] || []);
    type BoundHook = (cb: (err: any) => void) => (void|Promise<any>);
    let boundHooks: BoundHook[];
    if (arguments.length > 2) {
      done = arguments[arguments.length - 1];
      let argsEnd = arguments.length - 1;
      if (!(done instanceof Function)) {
        done = (e) => {};
        argsEnd = arguments.length;
      }
      const hookArgs = Array.from(arguments).slice(1, argsEnd);
      boundHooks = hooks.map(function(hook) {
        return hook.bind.apply(hook, [null].concat(hookArgs));
      });
    }
    if (!boundHooks) {
      boundHooks = <any>hooks;
    }
    done = done || ((e) => {});

    // A hook may return a promise or it may call a callback. We want to
    // treat hooks as though they always return promises, so this converts.
    const hookToPromise = (hook: BoundHook) => {
      return new Promise((resolve, reject) => {
        const maybePromise = hook((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
        if (maybePromise) {
          maybePromise.then(resolve, reject);
        }
      });
    };

    // We execute the handlers _sequentially_. This may be slower, but it gives
    // us a lighter cognitive load and more obvious logs.
    try {
      for (const hook of boundHooks) {
        await hookToPromise(hook);
      }
    } catch (err) {
      // TODO(rictic): stop silently swallowing the error here and just below.
      //     Looks like we'll need to track down some error being thrown from
      //     deep inside the express router.
      try {
        done(err);
      } catch (_) {
      }
      throw err;
    }
    try {
      done();
    } catch (_) {
    }
  };

  /**
   * @param {function(*, Array<!Plugin>)} done Asynchronously loads the plugins
   *     requested by `options.plugins`.
   */
  async plugins(): Promise<Plugin[]> {
    const plugins: Plugin[] = [];
    for (const name of this.enabledPlugins()) {
      plugins.push(await Plugin.get(name));
    }
    return plugins;
  }

  /**
   * @return {!Array<string>} The names of enabled plugins.
   */
  enabledPlugins(): string[] {
    // Plugins with falsy configuration or disabled: true are _not_ loaded.
    const pairs = _.reject(
        (<any>_).pairs(this.options.plugins),
        (p: [string, {disabled: boolean}]) => !p[1] || p[1].disabled);
    return _.map(pairs, (p) => p[0]);
  };

  /**
   * @param {string} name
   * @return {!Object}
   */
  pluginOptions(name: string) {
    return this.options.plugins[Plugin.shortName(name)];
  };

  static Context = Context;
}

module.exports = Context;
