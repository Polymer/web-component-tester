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
var wd    = require('wd');

var CleanKill = require('./cleankill');

// Browser abstraction, responsible for spinning up a browser instance via wd.js and
// executing runner.html test files passed in options.files
function BrowserRunner(emitter, local, def, options, doneCallback) {
  this.timeout = options.testTimeout;
  this.emitter = emitter;
  this.options = options;
  this.def = def;
  this.doneCallback = doneCallback;

  this.stats = {status: 'initializing'};

  var capabilities = _.defaults(_.clone(def), options.browserOptions);
  delete capabilities.id;

  CleanKill.onInterrupt(function(done) {
    if (!this.browser) return done();

    var origDoneCallback = this.doneCallback;
    this.doneCallback = function(error, runner) {
      done();
      origDoneCallback(error, runner);
    };
    this.done('Interrupting');
  }.bind(this));

  // Create wd browser instance
  if (local) {
    this.browser = wd.remote('localhost', options._seleniumPort);
  } else {
    var username  = options.sauce.username;
    var accessKey = options.sauce.accessKey;
    this.browser = wd.remote('ondemand.saucelabs.com', 80, username, accessKey);
  }

  this.browser.on('command', function(method, context) {
    emitter.emit('log:debug', def, chalk.cyan(method), context);
  });
  this.browser.on('http', function(method, path, data) {
    emitter.emit('log:debug', def, chalk.magenta(method), chalk.cyan(path), data);
  });
  this.browser.on('connection', function(code, message, error) {
    emitter.emit('log:warn', def, 'Error code ' + code + ':', message, error);
  });

  this.emitter.emit('browser-init', this.def, this.stats);

  // Initialize the browser, then start tests
  this.browser.init(capabilities, function(error, sessionId, result) {
    if (!this.browser) return; // When interrupted.
    if (error) {
      this.done(error.data || error);
    } else {
      this.sessionId = sessionId;
      this.startTest();
      this.extendTimeout();
    }
  }.bind(this));
}

BrowserRunner.prototype.startTest = function startTest() {
  var host  = 'http://localhost:' + this.options._httpPort;
  var path  = '/' + this.options.component + '/' + this.options.webRunner;
  var query = '?cli_browser_id=' + this.def.id;
  this.browser.get(host + path + query, function(error) {
    if (error) {
      this.done(error.data || error);
    } else {
      this.extendTimeout();
    }
  }.bind(this));
};

BrowserRunner.prototype.onEvent = function onEvent(event, data) {
  this.extendTimeout();

  if (event === 'browser-start') {
    // Always assign, to handle re-runs (no browser-init).
    this.stats = {
      status:  'running',
      passing: 0,
      pending: 0,
      failing: 0,
    };
  } else if (event === 'test-end') {
    this.stats[data.state] = this.stats[data.state] + 1;
    // Bump the connection to advance any remote timeouts.
    if (this.browser) {
      this.browser.title(function() {});
    }
  }

  if (event === 'browser-end') {
    this.done(data);
  } else {
    this.emitter.emit(event, this.def, data, this.stats);
  }
};

BrowserRunner.prototype.done = function done(error) {
  // No quitting for you!
  if (this.options.persistent) return;

  if (this.timeoutId) clearTimeout(this.timeoutId);
  // Don't double-quit.
  if (!this.browser) return;
  var browser = this.browser;
  this.browser = null;

  this.stats.status = error ? 'error' : 'complete';
  if (!error && this.stats.failing > 0) {
    error = this.stats.failing + ' failed tests';
  }

  this.emitter.emit('browser-end', this.def, error, this.stats);

  // Nothing to quit.
  if (!this.sessionId) {
    return this.doneCallback(error, this);
  }

  browser.quit(function(quitError) {
    if (quitError) {
      this.emitter.emit('log:warn', this.def, 'Failed to quit:', quitError.data || quitError);
    }
    this.doneCallback(error, this);
  }.bind(this));
};

BrowserRunner.prototype.extendTimeout = function extendTimeout() {
  if (this.options.persistent) return;
  if (this.timeoutId) clearTimeout(this.timeoutId);
  this.timeoutId = setTimeout(function() {
    this.done('Timed out');
  }.bind(this), this.timeout);
};

module.exports = BrowserRunner;
