/**
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
var express      = require('express');
var freeport     = require('freeport');
var fs           = require('fs');
var http         = require('http');
var path         = require('path');
var sauceConnect = require('sauce-connect-launcher');
var selenium     = require('selenium-standalone');
var send         = require('send');
var serveStatic  = require('serve-static');
var socketIO     = require('socket.io');
var temp         = require('temp');
var uuid         = require('uuid');
var which        = require('which');

var BrowserRunner = require('./browserrunner');
var CleanKill     = require('./cleankill');
var config        = require('./config');

// We prefer serving local assets over bower assets.
var PACKAGE_ROOT = path.resolve(__dirname, '..');
var SERVE_STATIC = {  // Keys are regexps.
  '^.*/web-component-tester/browser\\.js$':     path.join(PACKAGE_ROOT, 'browser.js'),
  '^.*/web-component-tester/environment\\.js$': path.join(PACKAGE_ROOT, 'environment.js'),
};

var INDEX_TEMPLATE = _.template(fs.readFileSync(
  path.resolve(__dirname, '../data/index.html'), {encoding: 'utf-8'}
));

// Steps (& Hooks)

function configure(context, done) {
  context.emit('log:debug', 'step: configure');
  var options = context.options;
  _.defaults(options, config.defaults());

  config.expand(options, process.cwd(), function(error) {
    if (error) return done(error);

    // Note that we trigger the configure hook _after_ filling in the `options`
    // object.
    //
    // If you want to modify options prior to this; do it during plugin init.
    context.emitHook('configure', done);
  });
}

function ensureSauceTunnel(options, context, done) {
  if (options.sauce.tunnelId) {
    return done(null, options.sauce.tunnelId);
  }
  if (!assertSauceCredentials(options, done)) return;

  // If anything goes wrong, sc tends to have a bit more detail in its log, so
  // let's make that easy(ish) to get at:
  temp.mkdir('wct', function(error, logDir) {
    if (error) return done(error);
    var logPath = path.join(logDir, 'sc.log');

    var connectOptions = {
      username:         options.sauce.username,
      accessKey:        options.sauce.accessKey,
      tunnelIdentifier: options.sauce.tunnelId || uuid.v4(),
      logger:           context.emit.bind(context, 'log:debug'),
      logfile:          logPath,
    };
    _.assign(connectOptions, options.sauce.tunnelOptions);
    var tunnelId = connectOptions.tunnelIdentifier;

    context.emit('log:info', 'Creating Sauce Connect tunnel');
    context.emit('log:info', 'Sauce Connect log:', chalk.magenta(logPath));
    context.emit('log:debug', 'sauce-connect-launcher options', connectOptions);
    sauceConnect(connectOptions, function(error, tunnel) {
      if (error) {
        context.emit('log:error', 'Sauce tunnel failed:');
      } else {
        context.emit('log:info', 'Sauce tunnel active:', chalk.yellow(tunnelId));
        context.emit('sauce:tunnel-active', tunnelId);
      }
      done(error, tunnelId);
    });
    // SauceConnectLauncher only supports one tunnel at a time; this allows us to
    // kill it before we've gotten our callback.
    CleanKill.onInterrupt(sauceConnect.kill.bind(sauceConnect));
  });
}

function startSeleniumServer(options, context, done) {
  checkSeleniumEnvironment(function(error) {
    if (error) return done(error);
    freeport(function(error, port) {
      if (error) return done(error);

      var server = selenium({}, ['-port', port]);
      var badExit = function() { done('Could not start Selenium'); };
      server.on('exit', badExit);

      function onOutput(data) {
        var str = data.toString();
        context.emit('log:debug', str);

        if (str.indexOf('Started org.openqa.jetty.jetty.Server') > -1) {
          server.removeListener('exit', badExit);
          context.emit('log:info', 'Selenium server running on port', chalk.yellow(port));
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
  });
}

function startStaticServer(options, context, done) {
  freeport(function(error, port) {
    if (error) return done(error);

    var app    = express();
    var server = http.createServer(app);

    app.use(function(request, response, next) {
      context.emit('log:debug', chalk.magenta(request.method), request.url);
      next();
    });

    _.each(SERVE_STATIC, function(file, url) {
      app.get(new RegExp(url), function(request, response) {
        send(request, file).pipe(response);
      });
    });

    if (options._webRunnerContent) {
      app.get(options._webRunner, function(request, response) {
        response.send(options._webRunnerContent);
      });
    }

    // Add plugin middleware
    _.values(options.plugins).forEach(function(plugin) {
      if (plugin.middleware) {
        app.use(plugin.middleware(options.root, plugin, context));
      }
    });

    app.use(serveStatic(options.root, {'index': ['index.html', 'index.htm']}));

    server.listen(port);
    server.port = port;
    CleanKill.onInterrupt(function(done) {
      server.close();
      done();
    });

    context.emit('log:info',
      'Web server running on port', chalk.yellow(port),
      'and serving from', chalk.magenta(options.root)
    );
    done(null, server);
  });
}

function runTests(context, done) {
  context.emit('log:warn', 'step: runTests');
  var options = context.options;
  injectWebRunner(options);

  var jobs = {
    http: startStaticServer.bind(null, options, context),
  };
  if (_.any(options.browsers, isLocal)) {
    jobs.selenium = startSeleniumServer.bind(null, options, context);
  }
  if (!_.every(options.browsers, isLocal)) {
    if (!assertSauceCredentials(options, done)) return; // Assert for the runners.
    jobs.sauceTunnel = ensureSauceTunnel.bind(null, options, context);
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
    var runners = runBrowsers(options, context, function(error) {
      if (error) {
        done(error);
      } else {
        done(failed ? 'Had failed tests' : null);
      }
    });

    socketIO(results.http).on('connection', function(socket) {
      context.emit('log:debug', 'Test client opened sideband socket');
      socket.on('client-event', function(data) {
        runners[data.browserId].onEvent(data.event, data.data);
      });
    });
  });
}

// Helpers

function injectWebRunner(options) {
  // Short circuit if we have only one .html suite to run: Run it directly.
  if (options.suites.length === 1 && options.suites[0].slice(-5) === '.html') {
    options._webRunner = '/' + options.suites[0];
  } else {
    options._webRunner = '/generated-index.html';
    options._webRunnerContent = INDEX_TEMPLATE(options);
  }
}

function checkSeleniumEnvironment(done) {
  which('java', function(error) {
    if (!error) return done();

    var message = 'java is not present on your PATH.';
    if (process.platform === 'win32') {
      message = message + '\n\n  Please install it: https://java.com/download/\n\n';
    } else if (process.platform === 'linux') {
      try {
        which.sync('apt-get');
        message = message + '\n\n  sudo apt-get install default-jre\n\n';
      } catch (error) {
        // There's not a clear default package for yum distros.
      }
    }

    done(message);
  });
}

function assertSauceCredentials(options, done) {
  if (options.sauce.username && options.sauce.accessKey) return true;
  done('Missing Sauce credentials. Did you forget to set SAUCE_USERNAME and/or SAUCE_ACCESS_KEY?');
}

function isLocal(browser) {
  return !browser.platform;
}

function runBrowsers(options, context, done) {
  if (options.browsers.length === 0) {
    throw new Error('No browsers configured to run');
  }

  // Up the socket limit so that we can maintain more active requests.
  // TODO(nevir): We should be queueing the browsers above some limit too.
  http.globalAgent.maxSockets = Math.max(http.globalAgent.maxSockets, options.browsers.length * 2);

  context.emit('run-start', options);

  var errors  = [];
  var numDone = 0;
  return options.browsers.map(function(browser, id) {
    browser.id = id;
    return new BrowserRunner(context, isLocal(browser), browser, options, function(error) {
      context.emit('log:debug', browser, 'BrowserRunner complete');
      if (error) errors.push(error);
      numDone = numDone + 1;
      if (numDone === options.browsers.length) {
        error = errors.length > 0 ? _.unique(errors).join(', ') : null;
        context.emit('run-end', error);
        done(error);
      }
    });
  });
}

module.exports = {
  configure:           configure,
  ensureSauceTunnel:   ensureSauceTunnel,
  startSeleniumServer: startSeleniumServer,
  startStaticServer:   startStaticServer,
  runTests:            runTests,
};
