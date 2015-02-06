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
var findup = require('findup-sync');
var fs     = require('fs');
var nomnom = require('nomnom');
var path   = require('path');

var paths = require('./paths');

var HOME_DIR    = path.resolve(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE);
var CONFIG_NAME = 'wct.conf.js';

// The full set of options, as a reference.
function defaults() {
  return {
    // The test suites that should be run.
    suites:      ['test/'],
    // Output stream to write log messages to.
    output:      process.stdout,
    // Whether the output stream should be treated as a TTY (and be given more
    // complex output formatting). Defaults to `output.isTTY`.
    ttyOutput:   undefined,
    // Spew all sorts of debugging messages.
    verbose:     false,
    // Display test results in expanded form. Verbose implies expanded.
    expanded:    false,
    // The on-disk path where tests & static files should be served from. Paths
    // (such as `suites`) are evaluated relative to this.
    //
    // By default, this is set to the directory above the current directory (so
    // that element repos can easily be tested with their dependencies).
    root:        undefined,
    // Idle timeout for tests.
    testTimeout: 90 * 1000,
    // Whether the browser should be closed after the tests run.
    persistent:  false,
    // Additional .js files to include in *generated* test indexes.
    extraScripts: [],
    // Webdriver capabilities objects for each browser that should be run.
    //
    // Capabilities can also contain a `url` value which is either a string URL
    // for the webdriver endpoint, or {hostname:, port:, user:, pwd:}.
    //
    // Most of the time you will want to rely on the WCT browser plugins to fill
    // this in for you (e.g. via `--local`, `--sauce`, etc).
    activeBrowsers: [],
    // Default capabilities to use when constructing webdriver connections (for
    // each browser specified in `activeBrowsers`). A handy place to hang common
    // configuration.
    //
    // Selenium: https://code.google.com/p/selenium/wiki/DesiredCapabilities
    // Sauce:    https://docs.saucelabs.com/reference/test-configuration/
    browserOptions: {},
    // The plugins that should be loaded, and their configuration.
    //
    // When an array, the named plugins will be loaded with their default
    // configuration. When an object, each key maps to a plugin, and values are
    // configuration values to be merged.
    //
    //   plugins: {
    //     local: {browsers: ['firefox', 'chrome']},
    //   }
    //
    plugins: ['local', 'sauce'],
    // Configuration options for the webserver that serves up your test files
    // and dependencies.
    //
    // Typically, you will not need to modify these values.
    webserver: {
      // The port that the webserver should run on. A port will be determined at
      // runtime if none is provided.
      port: undefined,
      // The hostname used when generating URLs for the webdriver client.
      hostname: 'localhost',
    },
  };
}

/** nomnom configuration for command line arguments.
 *
 * This might feel like duplication with `defaults()`, and out of place (why not
 * in `cli.js`?). But, not every option matches a configurable value, and it is
 * best to keep the configuration for these together to help keep them in sync.
 */
var ARG_CONFIG = {
  persistent: {
    help:      'Keep browsers active (refresh to rerun tests).',
    abbr:      'p',
    flag:      true,
  },
  root: {
    help:      'The root directory to serve tests from.',
    transform: path.resolve,
  },
  plugins: {
    help:      'Plugins that should be loaded.',
    metavar:   'NAME',
    full:      'plugin',
    list:       true,
  },
  skipPlugins: {
    help:      'Configured plugins that should _not_ be loaded.',
    metavar:   'NAME',
    full:      'skip-plugin',
    list:      true,
  },
  expanded: {
    help:      'Log a status line for each test run.',
    flag:      true,
  },
  verbose: {
    help:      'Log all the things.',
    flag:      true,
  },
  simpleOutput: {
    help:      'Avoid fancy terminal output.',
    flag:      true,
  },
  skipUpdateCheck: {
    help:      'Don\'t check for updates.',
    full:      'skip-update-check',
    flag:      true,
  },
  'webserver.port': {
    help:      'A port to use for the test webserver.',
    full:      'webserver-port',
  },
  'webserver.hostname': {
    full:      'webserver-hostname',
    hidden:    true,
  },
  // Managed by supports-color; let's not freak out if we see it.
  color: {flag: true},

  // Deprecated

  browsers: {
    abbr:   'b',
    hidden: true,
    list:   true,
  },
  remote: {
    abbr:   'r',
    hidden: true,
    flag:   true,
  }
};

// Values that should be extracted when pre-parsing args.
var PREPARSE_ARGS = ['plugins', 'skipPlugins', 'simpleOutput', 'skipUpdateCheck'];

/**
 * Discovers appropriate config files (global, and for the project), merging
 * them, and returning them.
 *
 * @return {!Object} The merged configuration.
 */
function fromDisk() {
  var globalFile  = path.join(HOME_DIR, CONFIG_NAME);
  var projectFile = findup(CONFIG_NAME, {nocase: true});
  // Load a shared config from the user's home dir, if they have one, and then
  // try the project-specific path (starting at the current working directory).
  var paths   = _.unique([globalFile, projectFile]);
  var configs = _.filter(paths, fs.existsSync).map(require);
  var options = merge.apply(null, configs);

  if (!options.root && projectFile && projectFile !== globalFile) {
    process.chdir(path.dirname(projectFile));
  }

  return options;
}

/**
 * Runs a simplified options parse over the command line arguments, extracting
 * any values that are necessary for a full parse.
 *
 * At the moment, the only values extracted are `--plugin` and `--simpleOutput`.
 *
 * @param {!Array<string>} args
 * @return {!Object}
 */
function preparseArgs(args) {
  // Don't let it short circuit on help.
  args = _.difference(args, ['--help', '-h']);

  var parser = nomnom();
  parser.options(ARG_CONFIG);
  parser.printer(function() {});  // No-op output & errors.
  var options = parser.parse(args);

  return _expandOptionPaths(_.pick(options, PREPARSE_ARGS));
}

/**
 * Runs a complete options parse over the args, respecting plugin options.
 *
 * @param {!Context} context The context, containing plugin state and any base
 *     options to merge into.
 * @param {!Array<string>} args The args to parse.
 * @param {function(*)} done
 */
function parseArgs(context, args, done) {
  var parser = nomnom();
  parser.script('wct');
  parser.options(ARG_CONFIG);

  context.plugins(function(error, plugins) {
    if (error) return done(error);

    plugins.forEach(_configurePluginOptions.bind(null, parser));
    var options = _expandOptionPaths(normalize(parser.parse(args)));
    if (options._ && options._.length > 0) {
      options.suites = options._;
    }

    context.options = merge(context.options, options);
    done();
  });
}

function _configurePluginOptions(parser, plugin) {
  if (!plugin.cliConfig || plugin.cliConfig.length === 0) return;

  // Group options per plugin. It'd be nice to also have a header, but that ends
  // up shifting all the options over.
  parser.option('plugins.' + plugin.name + '.', {string: ' '});

  _.each(plugin.cliConfig, function(config, key) {
    // Make sure that we don't expose the name prefixes.
    if (!config.full) {
      config.full = key;
    }
    parser.option('plugins.' + plugin.name + '.' + key, config);
  });
}

function _expandOptionPaths(options) {
  var result = {};
  _.each(options, function(value, key) {
    var target = result;
    var parts  = key.split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]] = target[parts[i]] || {};
    }
    target[_.last(parts)] = value;
  });
  return result;
}

/**
 * @param {!Object...} configs Configuration objects to merge.
 * @return {!Object} The merged configuration, where configuration objects
 *     specified later in the arguments list are given precedence.
 */
function merge() {
  var result  = {};
  var configs = Array.prototype.map.call(arguments, normalize);
  _.merge.apply(_, [result].concat(configs));

  // false plugin configs are preserved.
  configs.forEach(function(config) {
    _.each(config.plugins, function(value, key) {
      if (value === false) {
        result.plugins[key] = false;
      }
    });
  });

  return result;
}

/**
 * @param {!Object} config Configuration object to normalize.
 * @return {!Object} `config`.
 */
function normalize(config) {
  var i, name;
  if (_.isArray(config.plugins)) {
    var pluginConfigs = {};
    for (i = 0, name; name = config.plugins[i]; i++) {
      // A named plugin is explicitly enabled (e.g. --plugin foo).
      pluginConfigs[name] = {disabled: false};
    }
    config.plugins = pluginConfigs;
  }

  // Always wins.
  if (config.skipPlugins) {
    config.plugins = config.plugins || {};
    for (i = 0, name; name = config.skipPlugins[i]; i++) {
      config.plugins[name] = false;
    }
  }

  return config;
}

/**
 * Expands values within the configuration based on the current environment.
 *
 * @param {!Context} context The context for the current run.
 * @param {function(*)} done
 */
function expand(context, done) {
  var options = context.options;
  var root    = context.options.root || process.cwd();

  expandDeprecated(context, function(error) {
    if (error) return done(error);

    paths.expand(root, options.suites, function(error, suites) {
      if (error) return done(error);

      options.suites = suites;
      // Serve from the parent directory so that we can reference element deps.
      if (!options.root) {
        _serveFromParent(root, options);
      }

      done();
    });
  });
}

/**
 * Sets options.root to the parent directory of `baseDir`, and adjusts all
 * suites relative to it.
 *
 * @param {string} baseDir
 * @param {!Object} options
 */
function _serveFromParent(baseDir, options) {
  options.root = path.dirname(baseDir);

  var basename = path.basename(baseDir);
  options.suites = _.map(options.suites || [], function(file) {
    return path.join(basename, file);
  });
}

/**
 * Expands any options that have been deprecated, and warns about it.
 *
 * @param {!Context} context The context for the current run.
 */
function expandDeprecated(context, done) {
  var options = context.options;
  // We collect configuration fragments to be merged into the options object.
  var fragments = [];

  var browsers = _.isArray(options.browsers) ? options.browsers : [options.browsers];
  browsers = _.compact(browsers);
  if (browsers.length > 0) {
    context.emit('log:warn', 'The --browsers flag/option is deprecated. Please use --local and --sauce instead, or configure via plugins.[local|sauce].browsers.');
    var fragment = {plugins: {sauce: {}, local: {}}};
    fragments.push(fragment);

    for (var i = 0, browser; browser = browsers[i]; i++) {
      var name   = browser.browserName || browser;
      var plugin = browser.platform || name.indexOf('/') !== -1 ? 'sauce' : 'local';
      fragment.plugins[plugin].browsers = fragment.plugins[plugin].browsers || [];
      fragment.plugins[plugin].browsers.push(browser);
    }

    delete options.browsers;
  }

  if (options.sauce) {
    context.emit('log:warn', 'The sauce configuration key is deprecated. Please use plugins.sauce instead.');
    fragments.push({
      plugins: {sauce: options.sauce},
    });
    delete options.sauce;
  }

  if (options.remote) {
    context.emit('log:warn', 'The --remote flag is deprecated. Please use --sauce default instead.');
    fragments.push({
      plugins: {sauce: {browsers: ['default']}},
    });
    delete options.remote;
  }

  if (fragments.length > 0) {
    // We are careful to modify context.options in place.
    _.merge(context.options, merge.apply(null, fragments));
  }

  done();
}

/**
 * @param {!Object} options The configuration to validate.
 * @param {function(*)} Callback indicating whether the configuration is valid.
 */
function validate(options, done) {
  if (options.webRunner) {
    return done('webRunner is no longer a supported configuration option. Please list the files you wish to test as arguments, or as `suites` in a configuration object.');
  }
  if (options.component) {
    return done('component is no longer a supported configuration option. Please list the files you wish to test as arguments, or as `suites` in a configuration object.');
  }

  if (options.activeBrowsers.length === 0) {
    return done('No browsers configured to run');
  }
  if (options.suites.length === 0) {
    return done('No test suites were found matching your configuration');
  }

  done(null);
}

module.exports = {
  defaults:     defaults,
  fromDisk:     fromDisk,
  preparseArgs: preparseArgs,
  parseArgs:    parseArgs,
  merge:        merge,
  normalize:    normalize,
  expand:       expand,
  validate:     validate,
};
