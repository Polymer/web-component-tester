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
var http         = require('http');
var sauceConnect = require('sauce-connect-launcher');
var selenium     = require('selenium-standalone');
var serveStatic  = require('serve-static');
var socketIO     = require('socket.io');
var uuid         = require('uuid');

var BrowserRunner = require('./browserrunner');
var CleanKill     = require('./cleankill');

var DEFAULT_BROWSERS = require('../default-browsers.json');

// Steps

function ensureSauceTunnel(options, emitter, done) {
  if (options.sauce.tunnelId) {
    return done(null, options.sauce.tunnelId);
  }

  if (!assertSauceCredentials(options, done)) return;
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
};

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
};

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

function runTests(options, emitter, done) {
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
    if (!assertSauceCredentials(options, done)) return; // Assert for the runners.
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

// Helpers

function assertSauceCredentials(options, done) {
  if (options.sauce.username && options.sauce.accessKey) return true;
  done('Missing Sauce credentials. Did you forget to set SAUCE_USERNAME and/or SAUCE_ACCESS_KEY?');
}

function isLocal(browser) {
  return !browser.platform
}

function runBrowsers(options, emitter, done) {
  if (options.browsers.length === 0) {
    throw new Error('No browsers configured to run');
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
        var error = errors.length > 0 ? _.unique(errors).join(', ') : null;
        emitter.emit('run-end', error);
        done(error);
      }
    });
  });
}

module.exports = {
  ensureSauceTunnel:   ensureSauceTunnel,
  startSeleniumServer: startSeleniumServer,
  startStaticServer:   startStaticServer,
  runTests:            runTests,
};
