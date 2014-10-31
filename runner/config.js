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

var HOME_DIR    = path.resolve(process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE);
var CONFIG_NAME = 'wct.conf.js';

// The full set of options, as a reference.
function defaults() {
  return {
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
    remote:      true,
    // The on-disk path where tests & static files should be served from.
    root:        path.resolve('..'),
    // The component being tested. Must be a directory under `root`.
    component:   path.basename(process.cwd()),
    // The browsers that tests will be run on. Accepts capabilities objects,
    // local browser names ("chrome" etc), or remote browsers of the form
    // "<PLATFORM>/<BROWSER>[@<VERSION>]".
    browsers:    [],
    // The file (mounted under `<root>/<component>`) that runs the tests.
    webRunner:   'test/index.html',
    // Idle timeout for tests.
    testTimeout: 90 * 1000,
    // Whether the browser should be closed after the tests run.
    persistent:  false,
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
  var defaultValues = defaults();

  return yargs(args)
      .showHelpOnFail(false)
      .wrap(80)
      .usage(
        '\n' + // Even margin.
        'Run tests for web components across local or remote browsers.\n' +
        'Usage: ' + chalk.blue('$0 ' + chalk.dim('[PROJECT_DIR]')) + '\n' +
        '\n' +
        'If PROJECT_DIR is not specified, wct will search up from the current directory\n' +
        'to find your project root (first directory containing a webRunner)\n' +
        '\n' +
        'Specific browsers can be tested via the --browsers flag.\n' +
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
        'webRunner': {
          description: 'The entry point to your test suite.',
          default: defaultValues.webRunner,
        },
        'persistent': {
          description: 'Keep browsers active (refresh to rerun tests).',
          alias: 'p',
          boolean: true,
        },
        'expanded': {
          description: 'Log a status line for each test run.',
          boolean: true,
        },
        'verbose': {
          description: 'Log all the things.',
          boolean: true,
        },
      })
      .argv;
}

function fromEnv(env, args, output) {
  var argv = parseArgs(args);

  var options = {
    webRunner:  argv.webRunner,
    verbose:    argv.verbose,
    expanded:   Boolean(argv.expanded), // override the default of true.
    persistent: argv.persistent,
    remote:     Boolean(argv.remote),
    output:     output,
    ttyOutput:  output.isTTY,
    sauce: {
      username:  env.SAUCE_USERNAME,
      accessKey: env.SAUCE_ACCESS_KEY,
      tunnelId:  env.SAUCE_TUNNEL_ID,
    }
  };

  if (argv.browsers) {
    var browsers = _.isArray(argv.browsers) ? argv.browsers : [argv.browsers];
    // We also support comma separated browser identifiers for convenience.
    options.browsers = browsers.join(',').split(',');
  }

  options.extraArgs = argv._;

  options = _.merge(defaults(), fromDisk(), options);
  // Now that we have a fully specified set of options, project root:
  if (!options.projectRoot) {
    var webRunnerPath = findup(options.webRunner);
    if (webRunnerPath) {
      options.projectRoot = webRunnerPath.slice(0, -options.webRunner.length);
    }
  }

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

  if (projectFile && projectFile !== globalFile) {
    options.projectRoot = projectFile.slice(0, -CONFIG_NAME.length);
  }

  return options;
}

module.exports = {
  defaults: defaults,
  fromEnv:  fromEnv,
  fromDisk: fromDisk,
};
