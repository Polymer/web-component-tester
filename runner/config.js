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
var chalk  = require('chalk');
var findup = require('findup-sync');
var fs     = require('fs');
var path   = require('path');
var yargs  = require('yargs');

var browsers = require('./browsers');
var paths    = require('./paths');

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
    expanded:    true,
    // Whether the default set of local (or remote) browsers should be targeted.
    remote:      false,
    // The on-disk path where tests & static files should be served from. By
    // default, this is the directory above the current project (so that
    // element repos can be easily tested with their dependencies).
    root:        undefined,
    // The browsers that tests will be run on. Accepts capabilities objects,
    // local browser names ("chrome" etc), or remote browsers of the form
    // "<PLATFORM>/<BROWSER>[@<VERSION>]".
    browsers:    [],
    // Idle timeout for tests.
    testTimeout: 90 * 1000,
    // Whether the browser should be closed after the tests run.
    persistent:  false,
    // Additional .js files to include in *generated* test indexes.
    extraScripts: [],
    // Extra capabilities to pass to wd when building a client.
    //
    // Selenium: https://code.google.com/p/selenium/wiki/DesiredCapabilities
    // Sauce:    https://docs.saucelabs.com/reference/test-configuration/
    browserOptions: {},
    // Sauce Labs configuration.
    sauce: {
      username:  undefined,
      accessKey: undefined,
      // An ID of a sauce connect tunnel to reuse.
      tunnelId:  undefined,
      // https://github.com/bermi/sauce-connect-launcher#advanced-usage
      tunnelOptions: {},
    },
  };
}

function parseArgs(args) {
  return yargs(args)
      .showHelpOnFail(false)
      .wrap(80)
      .usage(
        '\n' + // Even margin.
        'Run tests for web components across local or remote browsers.\n' +
        'Usage: ' + chalk.blue('$0' + chalk.dim(' <options> [dirs or paths/to/test ...]')) + '\n' +
        '\n' +
        'wct will search up from the current directory to find your project root (first\n' +
        'directory containing a wct.conf.js - or current directory if not found.)\n' +
        '\n' +
        'Local browsers are specified via short names:\n' +
        browsers.present().join(', ') + '\n' +
        '\n' +
        'Remote browsers can be specified via "<PLATFORM>/<BROWSER>[@<VERSION>]". For an\n' +
        'up to date list, see https://saucelabs.com/platforms'
      )
      .help('help', 'Yer lookin\' at it!')
      .alias('h', 'help')
      .options({
        'remote': {
          description: 'Use default remote browsers (instead of local).',
          alias: 'r',
          boolean: true,
        },
        'browsers': {
          description: 'Run specific browsers, rather than the defaults.',
          alias: 'b',
        },
        'persistent': {
          description: 'Keep browsers active (refresh to rerun tests).',
          alias: 'p',
          boolean: true,
        },
        'root': {
          description: 'The root directory to serve tests from.',
        },
        'expanded': {
          description: 'Log a status line for each test run.',
          boolean: true,
        },
        'verbose': {
          description: 'Log all the things.',
          boolean: true,
        },
        'simpleOutput': {
          description: 'Avoid fancy terminal tricks.',
          boolean: true,
        },
      })
      .argv;
}

function fromEnv(env, args, output) {
  var argv = parseArgs(args);

  var options = _.merge(argv, {
    output:     output,
    ttyOutput:  output.isTTY && !argv.simpleOutput,
    sauce: {
      username:  env.SAUCE_USERNAME,
      accessKey: env.SAUCE_ACCESS_KEY,
      tunnelId:  env.SAUCE_TUNNEL_ID,
    }
  });

  if (argv.browsers) {
    var browsers = _.isArray(argv.browsers) ? argv.browsers : [argv.browsers];
    // We also support comma separated browser identifiers for convenience.
    options.browsers = browsers.join(',').split(',');
  }

  options.extraArgs = argv._;

  options = _.merge(defaults(), fromDisk(), options);
  options = mergePlugins(options);

  return options;
}

/**
 * Mix plugins into configuration.
 *
 * Loads the plugin module for every key in `options.plugins` and merges it
 * with the user-supplied configuration.
 *
 * In other words, given:
 *
 *   # my-plugin.js
 *   module.exports = {
 *     "reporter": function(..)
 *   }
 *
 *   # wct.js
 *   module.exports = {
 *     plugins: {
 *       "my-plugin": {
 *         "foo": "bar"
 *       }
 *     }
 *   }
 *
 * mergePlugin(options) produces an object like this:
 *
 *   plugins: {
 *     "my-plugin": {
 *       "foo": "bar",
 *       "reporter": function(..)
 *     }
 *   }
 *
 */
function mergePlugins(options) {
  _(options.plugins).forOwn(function( userConfig, pluginName ) {
      var moduleConfig = require(pluginName);
      options.plugins[pluginName] = _.merge(moduleConfig, userConfig);
  });

  return options;
}

function fromDisk() {
  var globalFile  = path.join(HOME_DIR, CONFIG_NAME);
  var projectFile = findup(CONFIG_NAME, {nocase: true});
  // Load a shared config from the user's home dir, if they have one, and then
  // try the project-specific path (starting at the current working directory).
  var paths   = _.unique([globalFile, projectFile]);
  var configs = _.filter(paths, fs.existsSync).map(require);
  var options = _.merge.apply(_, [{}].concat(configs));

  if (!options.root && projectFile && projectFile !== globalFile) {
    process.chdir(path.dirname(projectFile));
  }

  return options;
}

/**
 * Expands values within the configuration based on the current environment.
 *
 * @param {!Object} options The configuration to expand.
 * @param {string} baseDir The directory paths should be relative to.
 * @param {function(*, options)} Callback given the expanded options on success.
 */
function expand(options, baseDir, done) {
  var root = options.root || baseDir;

  browsers.expand(options.browsers, options.remote, function(error, browsers) {
    if (error) return done(error);
    options.browsers = browsers;

    paths.expand(root, options.suites, function(error, suites) {
      if (error) return done(error);

      options.suites = suites;
      // Serve from the parent directory so that we can reference element deps.
      if (!options.root) {
        serveFromParent(root, options);
      }

      validate(options, function(error) {
        done(error, options);
      });
    });
  });
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

  if (options.browsers.length === 0) {
    return done('No browsers configured to run');
  }
  if (options.suites.length === 0) {
    return done('No test suites were found matching your configuration');
  }

  done(null);
}


/**
 * Sets options.root to the parent directory of `baseDir`, and adjusts all
 * suites relative to it.
 *
 * @param {string} baseDir
 * @param {!Object} options
 */
function serveFromParent(baseDir, options) {
  options.root = path.dirname(baseDir);

  var basename = path.basename(baseDir);
  options.suites = _.map(options.suites || [], function(file) {
    return path.join(basename, file);
  });
}

module.exports = {
  defaults: defaults,
  fromEnv:  fromEnv,
  fromDisk: fromDisk,
  expand:   expand,
};
