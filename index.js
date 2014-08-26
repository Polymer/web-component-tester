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

var BrowserRunner = require('./lib/browserrunner');
var CleanKill     = require('./lib/cleankill');
var CliReporter   = require('./lib/clireporter');

var DEFAULT_BROWSERS = require('./default-browsers.json');

// Also, the full set of options, as a reference.
function defaultOptions() {
  return {
    // Spew all sorts of debugging messages.
    verbose:     false,
    // Display test results in expanded form. Verbose implies expanded.
    expanded:    false,
    // The on-disk path where tests & static files should be served from.
    root:        path.resolve('..'),
    // The component being tested. Must be a directory under `root`.
    component:   path.basename(process.cwd()),
    // The browsers that tests will be run on.
    browsers:    [],
    // The file (mounted under `<root>/<component>`) that runs the tests.
    webRunner:   'tests/runner.html',
    // Idle timeout for tests.
    testTimeout: 300 * 1000,
    // Whether the browser should be closed after the tests run.
    persistent:  false,
    // Extra capabilities to pass to wd when building a client.
    //
    // Selenium: https://code.google.com/p/selenium/wiki/DesiredCapabilities
    // Sauce:    https://docs.saucelabs.com/reference/test-configuration/
    browserOptions: {
      'idle-timeout': 10,
    },
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
  var options = defaultOptions();

  if (!_.isUndefined(argv.verbose))    options.verbose    = argv.verbose;
  if (!_.isUndefined(argv.expanded))   options.expanded   = argv.expanded;
  if (!_.isUndefined(argv.persistent)) options.persistent = argv.persistent;
  if (argv.browsers) {
    options.browsers = argv.browsers.split(',').map(function(name) {
      return {browserName: name};
    });
  }

  _.defaults(options.sauce, {
    username:  env.SAUCE_USERNAME,
    accessKey: env.SAUCE_ACCESS_KEY,
    tunnelId:  env.SAUCE_TUNNEL_ID,
  });

  return options;
}

function isLocal(browser) {
  return !browser.platform
}

function endRun(emitter, spin, done) {
  return function(error) {
    // Many of our tasks should spin indefinitely ...unless they encounter an error.
    if (error || !spin) {
      emitter.emit('run-end', error);
      done(error);
      CleanKill.interrupt();
    }
  }
}

function initGulp(gulp) {
  var emitter = new events.EventEmitter();
  var options = optionsFromEnv(process.env, process.argv);
  new CliReporter(emitter, process.stdout, options);

  var spinRun  = endRun.bind(null, emitter, true);
  var cleanRun = endRun.bind(null, emitter, false);

  gulp.task('wc:sauce-tunnel', function(done) {
    ensureSauceTunnel(options, emitter, spinRun(done));
  });
  gulp.task('wc:selenium-server', function(done) {
    startSeleniumServer(options, emitter, spinRun(done));
  });
  gulp.task('wc:static-server', function(done) {
    startStaticServer(options, emitter, spinRun(done));
  });
  gulp.task('wc:test-server', function(done) {
    startTestServer(options, emitter, spinRun(done));
  });

  gulp.task('test:local', function(done) {
    if (options.browsers.length === 0) {
      options.browsers = DEFAULT_BROWSERS.local;
    }
    startTestServer(options, emitter, cleanRun(done));
  });

  gulp.task('test:remote', function(done) {
    if (options.browsers.length === 0) {
      options.browsers = DEFAULT_BROWSERS.remote;
    }
    startTestServer(options, emitter, cleanRun(done));
  });

  gulp.task('test', ['test:local']);
}

// Standalone testing

function test(options, done) {
  _.defaults(options, defaultOptions());
  var emitter = new events.EventEmitter();
  startTestServer(options, emitter, done);
  return emitter;
}

// Steps

function ensureSauceTunnel(options, emitter, done) {
  if (options.sauce.tunnelId) {
    return done(null, options.sauce.tunnelId);
  }

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
    server.stdout.on('data', function(data) {
      if (data.toString().indexOf('Started org.openqa.jetty.jetty.Server') > -1) {
        server.removeListener('exit', badExit);
        emitter.emit('log:info', 'Selenium server running on port', chalk.yellow(port));
        done(null, port);
      }
    });
    server.stdout.on('data', emitter.emit.bind(emitter, 'log:debug'));
    server.stderr.on('data', emitter.emit.bind(emitter, 'log:debug'));

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
  var jobs = {
    http:     startStaticServer.bind(null, options, emitter),
    selenium: startSeleniumServer.bind(null, options, emitter),
  };
  if (!_.every(options.browsers, isLocal)) {
    jobs.sauceTunnel = ensureSauceTunnel.bind(null, options, emitter);
  }

  async.parallel(jobs, function(error, results) {
    if (error) return done(error);

    // TODO(nevir) Clean up hackish semi-private options.
    options._seleniumPort = results.selenium;
    options._httpPort     = results.http.port;
    if (results.sauceTunnel) {
      options.browserOptions['tunnel-identifier'] = results.sauceTunnel;
    }

    var runners = runBrowsers(options, emitter, done);

    socketIO(results.http).on('connection', function(socket) {
      emitter.emit('log:debug', 'Test client opened sideband socket');
      socket.on('client-event', function(data) {
        var runner = runners[data.browserId];
        data.browser = runner.def;
        emitter.emit('log:debug', data.browser, chalk.magenta('client-event'), data);

        if (data.event === 'browser-end') {
          runner.done();
        } else {
          emitter.emit(data.event, data.browser, data.data);
        }
      });
    });
  });
}

function runBrowsers(options, emitter, done) {
  if (options.browsers.length === 0) {
    return done('No browsers configured to run');
  }

  var errored  = false;
  var numDone = 0;
  return options.browsers.map(function(browser, id) {
    browser.id = id;
    emitter.emit()
    return new BrowserRunner(emitter, isLocal(browser), browser, options, function(error) {
      emitter.emit('log:debug', browser, 'BrowserRunner complete');
      if (error) errored = true;
      numDone = numDone + 1;
      if (numDone === options.browsers.length) {
        done(errored ? 'Test errors' : null);
      }
    });
  });
}

module.exports = {
  initGulp: initGulp,
  test:     test,
};
