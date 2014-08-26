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

  var capabilities = _.defaults(_.clone(def), options.browserOptions);
  delete capabilities.id;

  CleanKill.onInterrupt(function(done) {
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

  // Initialize the browser, then start tests
  this.browser.init(capabilities, function(error, sessionId, result) {
    if (!this.browser) return; // When interrupted.
    if (error) {
      this.done(error.data || error);
    } else {
      this.sessionId = sessionId;
      this.emitter.emit('browser-init', this.def, sessionId, result);
      this.startTest();
      this.extendTimeout();
    }
  }.bind(this));
}

BrowserRunner.prototype.startTest = function startTest() {
  var host  = 'http://localhost:' + this.options._httpPort;
  var path  = '/' + this.options.component + '/' + this.options.webRunner;
  var query = '?browser=' + this.def.id;
  this.browser.get(host + path + query, function(error) {
    if (error) this.done(error.data || error);
  }.bind(this));
};

BrowserRunner.prototype.done = function done(error) {
  // No quitting for you!
  if (this.options.persistent) return;

  if (this.timeoutId) clearTimeout(this.timeoutId);
  // Don't double-quit.
  if (!this.browser) return;
  var browser = this.browser;
  this.browser = null;

  this.emitter.emit('browser-end', this.def, error);

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
