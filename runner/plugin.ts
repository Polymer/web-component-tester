/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as _ from 'lodash';
import * as path from 'path';

import {Context} from './context';
import {Config} from './config';

// Plugin module names can be prefixed by the following:
const PREFIXES = [
  'web-component-tester-',
  'wct-',
];

interface Metadata {
};

/**
 * A WCT plugin. This constructor is private. Plugins can be retrieved via
 * `Plugin.get`.
 */
export class Plugin {
  name: string;
  cliConfig: Config;
  packageName: string;
  metadata: Metadata;
  constructor(packageName: string, metadata: Metadata) {
    this.packageName = packageName;
    this.metadata = metadata;
    this.name = Plugin.shortName(packageName);

    this.cliConfig = this.metadata['cli-options'] || {};
  }

  /**
   * @param {!Context} context The context that this plugin should be evaluated
   *     within.
   * @param {function(*)} done
   */
  execute(context: Context, done: (message?: string) => void): void {
    try {
      require(this.packageName)(
            context, context.pluginOptions(this.name), this);
    } catch (error) {
      return done('Failed to load plugin "' + this.name + '": ' + error);
    }
    done();
  };

  /**
   * Retrieves a plugin by shorthand or module name (loading it as necessary).
   *
   * @param {string} name
   * @param {function(*, Plugin)} done
   */
  static get(name: string, done: (err: any, plugin?: Plugin) => void): void {
    const shortName = Plugin.shortName(name);
    if (_loadedPlugins[shortName]) {
      return done(null, _loadedPlugins[shortName]);
    }

    const names = [shortName].concat(PREFIXES.map((p) => p + shortName));
    const loaded = _.compact(names.map(_tryLoadPluginPackage));
    if (loaded.length > 1) {
      const prettyNames = loaded.map((p) => p.packageName).join(' ');
      done('Loaded conflicting WCT plugin packages: ' + prettyNames);
    } else if (loaded.length < 1) {
      done('Could not find WCT plugin named "' + name + '"');
    } else {
      done(null, loaded[0]);
    }
  };

  /**
   * @param {string} name
   * @return {string} The short form of `name`.
   */
  static shortName(name: string) {
    for (const prefix of PREFIXES) {
      if (name.indexOf(prefix) === 0) {
        return name.substr(prefix.length);
      }
    }
    return name;
  };

  // HACK(rictic): Makes es6 style imports happy, so that we can do, e.g.
  //     import {Plugin} from './plugin';
  static Plugin = Plugin;
}

// Plugin Loading

// We maintain an identity map of plugins, keyed by short name.
const _loadedPlugins: {[name: string]: Plugin} = {};

/**
 * @param {string} packageName Attempts to load a package as a WCT plugin.
 * @return {Plugin}
 */
function _tryLoadPluginPackage(packageName: string) {
  let packageInfo: Object;
  try {
    packageInfo = require(path.join(packageName, 'package.json'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      console.log(error);
    }
    return null;
  }

  // Plugins must have a (truthy) wct-plugin field.
  if (!packageInfo['wct-plugin']) return null;
  // Allow {"wct-plugin": true} as a shorthand.
  const metadata =
      _.isObject(packageInfo['wct-plugin']) ? packageInfo['wct-plugin'] : {};

  return new Plugin(packageName, metadata);
}


module.exports = Plugin;
