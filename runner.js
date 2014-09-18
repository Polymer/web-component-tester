/*
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

var _            = require('lodash');
var async        = require('async');
var chalk        = require('chalk');
var events       = require('events');
var express      = require('express');
var freeport     = require('freeport');
var http         = require('http');
var path         = require('path');
var sauceConnect = require('sauce-connect-launcher');
var selenium     = require('selenium-standalone');
var serveStatic  = require('serve-static');
var socketIO     = require('socket.io');
var uuid         = require('uuid');
var yargs        = require('yargs');

var BrowserRunner = require('./runner/browserrunner');
var CleanKill     = require('./runner/cleankill');
var CliReporter   = require('./runner/clireporter');

var DEFAULT_BROWSERS = require('./default-browsers.json');

// Also, the full set of options, as a reference.
function defaultOptions() {
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
    // Whether local (or remote) browsers should be targeted.
    remote:      true,
    // The on-disk path where tests & static files should be served from.
    root:        path.resolve('..'),
    // The component being tested. Must be a directory under `root`.
    component:   path.basename(process.cwd()),
    // The browsers that tests will be run on.
    browsers:    [],
    // The file (mounted under `<root>/<component>`) that runs the tests.
    webRunner:   'tests/index.html',
    // Idle timeout for tests.
    testTimeout: 60 * 1000,
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

function optionsFromEnv(env, args) {
  var argv = yargs(args).argv;

  var options = {
    webRunner:  argv.webRunner,
    verbose:    argv.verbose,
    expanded:   Boolean(argv.expanded), // override the default of true.
    persistent: argv.persistent,
    sauce: {
      username:  env.SAUCE_USERNAME,
      accessKey: env.SAUCE_ACCESS_KEY,
      tunnelId:  env.SAUCE_TUNNEL_ID,
    }
  };
  if (argv.browsers) {
    options.browsers = argv.browsers.split(',').map(function(name) {
      return {browserName: name};
    });
  }

  return mergeDefaults(options);
}

// Standalone testing

function initGulp(gulp) {
  var emitter = new events.EventEmitter();
  var options = optionsFromEnv(process.env, process.argv);
  new CliReporter(emitter, options.output, options);

  var spinRun  = endRun.bind(null, emitter, true);
  var cleanRun = endRun.bind(null, emitter, false);

  gulp.task('wct:sauce-tunnel', function(done) {
    ensureSauceTunnel(options, emitter, spinRun(done));
  });
  gulp.task('test:local', function(done) {
    options.remote = false;
    startTestServer(options, emitter, cleanRun(done));
  });

  gulp.task('test:remote', function(done) {
    options.remote = true;
    startTestServer(options, emitter, cleanRun(done));
  });

  gulp.task('test', ['test:local']);
}

function test(options, done) {
  mergeDefaults(options);
  var emitter = new events.EventEmitter();
  new CliReporter(emitter, options.output, options);

  startTestServer(options, emitter, endRun(emitter, false, done));
  return emitter;
}

// Steps

function ensureSauceTunnel(options, emitter, done) {
  if (options.sauce.tunnelId) {
    return done(null, options.sauce.tunnelId);
  }

  assertSauceCredentials(options);
  var connectOptions = {
    username:         options.sauce.username,
    accessKey:        options.sauce.accessKey,
    tunnelIdentifier: options.sauce.tunnelId || uuid.v4(),
    logger:           emitter.emit.bind(emitter, 'log:debug'),
  };
  _.assign(connectOptions, options.sauce.tunnelOptions);
  var tunnelId = connectOptions.tunnelIdentifier;

  emitter.emit('log:info', 'Creating Sauce Connect tunnel');
  emitter.emit('log:debug', 'sauce-connect-launcher options', connectOptions);
  sauceConnect(connectOptions, function(error, tunnel) {
    if (error) {
      emitter.emit('log:error', 'Sauce tunnel failed:', error);
    } else {
      emitter.emit('log:info', 'Sauce tunnel active:', chalk.yellow(tunnelId));
    }
    done(error, tunnelId);
  });
  // SauceConnectLauncher only supports one tunnel at a time; this allows us to
  // kill it before we've gotten our callback.
  CleanKill.onInterrupt(sauceConnect.kill.bind(sauceConnect));
}

function startSeleniumServer(options, emitter, done) {
  freeport(function(error, port) {
    if (error) return done(error);

    var server = selenium({}, ['-port', port]);
    var badExit = function() { done('Could not start Selenium'); };
    server.on('exit', badExit);

    function onOutput(data) {
      var str = data.toString();
      emitter.emit('log:debug', str);

      if (str.indexOf('Started org.openqa.jetty.jetty.Server') > -1) {
        server.removeListener('exit', badExit);
        emitter.emit('log:info', 'Selenium server running on port', chalk.yellow(port));
        done(null, port);
      }
    }
    server.stdout.on('data', onOutput);
    server.stderr.on('data', onOutput);

    CleanKill.onInterrupt(function(done) {
      server.kill();
      done();
    });
  });
}

function startStaticServer(options, emitter, done) {
  freeport(function(error, port) {
    if (error) return done(error);

    var app    = express();
    var server = http.createServer(app);

    app.use(function(request, response, next) {
      emitter.emit('log:debug', chalk.magenta(request.method), request.url);
      next();
    });
    app.use(serveStatic(options.root, {'index': ['index.html', 'index.htm']}));

    server.listen(port);
    server.port = port;
    CleanKill.onInterrupt(function(done) {
      server.close();
      done();
    });

    emitter.emit('log:info',
      'Web server running on port', chalk.yellow(port),
      'and serving from', chalk.magenta(options.root)
    );
    done(null, server);
  });
}

function startTestServer(options, emitter, done) {
  if (options.browsers.length === 0) {
    options.browsers = options.remote ? DEFAULT_BROWSERS.remote : DEFAULT_BROWSERS.local;
  }

  var jobs = {
    http: startStaticServer.bind(null, options, emitter),
  };
  if (_.any(options.browsers, isLocal)) {
    jobs.selenium = startSeleniumServer.bind(null, options, emitter);
  }
  if (!_.every(options.browsers, isLocal)) {
    assertSauceCredentials(options); // Assert for the runners.
    jobs.sauceTunnel = ensureSauceTunnel.bind(null, options, emitter);
  }

  async.parallel(jobs, function(error, results) {
    if (error) return done(error);

    // TODO(nevir): Clean up hackish semi-private options.
    options._seleniumPort = results.selenium;
    options._httpPort     = results.http.port;
    if (results.sauceTunnel) {
      options.browserOptions['tunnel-identifier'] = results.sauceTunnel;
    }

    var failed = false;
    var runners = runBrowsers(options, emitter, function(error) {
      if (error) {
        done(error);
      } else {
        done(failed ? 'Had failed tests' : null);
      }
    });

    socketIO(results.http).on('connection', function(socket) {
      emitter.emit('log:debug', 'Test client opened sideband socket');
      socket.on('client-event', function(data) {
        runners[data.browserId].onEvent(data.event, data.data);
      });
    });
  });
}

// Utility

function mergeDefaults(options) {
  var defaults = defaultOptions();

  _.defaults(options,       defaults);
  _.defaults(options.sauce, defaults.sauce);

  if (typeof(options.ttyOutput) === 'undefined') {
    options.ttyOutput = options.output.isTTY;
  }

  return options;
}

function assertSauceCredentials(options) {
  if (options.sauce.username && options.sauce.accessKey) return;
  throw stacklessError('Missing Sauce credentials. Did you forget to set SAUCE_USERNAME and/or SAUCE_ACCESS_KEY?');
}

function stacklessError(message) {
  var error = new Error(chalk.red(message));
  error.showStack = false;
  return error;
}

function isLocal(browser) {
  return !browser.platform
}

function endRun(emitter, spin, done) {
  return function(error) {
    // Many of our tasks should spin indefinitely ...unless they encounter an error.
    if (error || !spin) {
      emitter.emit('run-end', error);
      if (_.isString(error)) {
        error = stacklessError(error);
      }
      CleanKill.close(done.bind(null, error));
    }
  }
}

function runBrowsers(options, emitter, done) {
  if (options.browsers.length === 0) {
    throw stacklessError('No browsers configured to run');
  }

  // Up the socket limit so that we can maintain more active requests.
  // TODO(nevir): We should be queueing the browsers above some limit too.
  http.globalAgent.maxSockets = Math.max(http.globalAgent.maxSockets, options.browsers.length * 2);

  emitter.emit('run-start', options);

  var errors  = [];
  var numDone = 0;
  return options.browsers.map(function(browser, id) {
    browser.id = id;
    return new BrowserRunner(emitter, isLocal(browser), browser, options, function(error) {
      emitter.emit('log:debug', browser, 'BrowserRunner complete');
      if (error) errors.push(error);
      numDone = numDone + 1;
      if (numDone === options.browsers.length) {
        done(errors.length > 0 ? _.unique(errors).join(', '): null);
      }
    });
  });
}

// Exports

module.exports = {
  test:              test,
  initGulp:          initGulp,
  defaultOptions:    defaultOptions,
  optionsFromEnv:    optionsFromEnv,
  ensureSauceTunnel: ensureSauceTunnel,
  startStaticServer: startStaticServer,
  startTestServer:   startTestServer,
};
