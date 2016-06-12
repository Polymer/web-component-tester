/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as events from 'events';
import * as http from 'http';
import * as _ from 'lodash';
import * as socketIO from 'socket.io';
import * as util from 'util';

import {BrowserRunner} from './browserrunner';
import * as config from './config';
import {Plugin} from './plugin';

type Handler = (o: {}, callback: (err: any) => void) => void;

/**
 * Exposes the current state of a WCT run, and emits events/hooks for anyone
 * downstream to listen to.
 *
 * @param {Object} options Any initially specified options.
 */
export class Context extends events.EventEmitter {
  options: config.Config;
  private _hookHandlers: {[key: string]: Handler[]} = {};
  _socketIOServer: SocketIO.Server;
  _httpServer: http.Server;
  _testRunners: BrowserRunner[];

  constructor(options: config.Config) {
    super();
    options = options || <config.Config>{};

    /**
     * The configuration for the current WCT run.
     *
     * We guarantee that this object is never replaced (e.g. you are free to hold
     * a reference to it, and make changes to it).
     */
    this.options = config.merge(
      config.defaults(),
      config.fromDisk(options.enforceJsonConf, options.root),
      options
    );
  }

  // Hooks
  //
  // In addition to emitting events, a context also exposes "hooks" that
  // interested parties can use to inject behavior.

  /**
   * Registers a handler for a particular hook. Hooks are typically configured to
   * run _before_ a particular behavior.
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
  emitHook(name: 'prepare:webserver',
           app: Express.Application, done: (err?: any) => void): Context;
  emitHook(name: 'configure', done: (err?: any) => void): Context;
  emitHook(name: 'prepare', done: (err?: any) => void): Context;
  emitHook(name: 'cleanup', done: (err?: any) => void): Context;
  emitHook(name: string, done: (err?: any) => void): Context;
  emitHook(name: string, ...args: any[]): Context;
  emitHook(name: string, done: (err?: any) => void): Context {
    done = done || ((e) => {});
    this.emit('log:debug', 'hook:', name);

    const hooks = (this._hookHandlers[name] || []);
    let boundHooks: ((cb: (err: any) => void) => void)[];
    if (arguments.length > 2) {
      const hookArgs = Array.from(arguments).slice(1, arguments.length - 1);
      done = arguments[arguments.length - 1];
      boundHooks = hooks.map(function(hook) {
        return hook.bind.apply(hook, [null].concat(hookArgs));
      });
    }
    if (!boundHooks) {
      boundHooks = <any>hooks;
    }

    // We execute the handlers _sequentially_. This may be slower, but it gives us
    // a lighter cognitive load and more obvious logs.
    let promise = Promise.resolve(null);
    for (const hook of boundHooks) {
      promise = promise.then(() => {
        return new Promise((resolve, reject) => {
          hook((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    }
    promise.then(() => done(), (err) => done(err));

    return this;
  };

  /**
   * @param {function(*, Array<!Plugin>)} done Asynchronously loads the plugins
   *     requested by `options.plugins`.
   */
  plugins(done: (err: any, plugins?: Plugin[]) => void): void {
    this._plugins().then(
      (plugins) => done(null, plugins),
      (err) => done(err)
    );
  };

  private async _plugins() {
    const plugins: Plugin[] = [];
    for (const name of this.enabledPlugins()) {
      const plugin = await (new Promise<Plugin>((resolve, reject) => {
        Plugin.get(name, (err, plugin) => {
          if (err) {
            reject(err);
          } else {
            resolve(plugin);
          }
        });
      }));
      plugins.push(plugin);
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
