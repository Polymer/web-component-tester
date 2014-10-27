/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var _     = require('lodash');
var chalk = require('chalk');
var path  = require('path');
var yargs = require('yargs');

var browsers = require('./browsers');

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
        },
        'expanded': {
          description: 'Log a status line for each test run.',
        },
        'verbose': {
          description: 'Log all the things.',
        },
      })
      .argv;
}

function fromEnv(env, args) {
  var argv = parseArgs(args);

  var options = {
    webRunner:  argv.webRunner,
    verbose:    argv.verbose,
    expanded:   Boolean(argv.expanded), // override the default of true.
    persistent: argv.persistent,
    remote:     Boolean(argv.remote),
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

  return options;
}

function mergeDefaults(options) {
  var baseOptions = defaults();

  _.defaults(options,       baseOptions);
  _.defaults(options.sauce, baseOptions.sauce);

  if (typeof(options.ttyOutput) === 'undefined') {
    options.ttyOutput = options.output.isTTY;
  }

  return options;
}

module.exports = {
  defaults:      defaults,
  fromEnv:       fromEnv,
  mergeDefaults: mergeDefaults,
};
