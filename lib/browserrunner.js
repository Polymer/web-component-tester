var chalk = require('chalk');
var wd    = require('wd');

// Browser abstraction, responsible for spinning up a browser instance via wd.js and
// executing runner.html test files passed in options.files
function BrowserRunner(reporter, local, def, options, doneCallback) {
  this.timeout = options.timeout || 1000 * 30;
  this.reporter = reporter;
  this.options = options;
  this.def = def;
  this.doneCallback = doneCallback;

  process.on('exit', this.done.bind(this, 'shutting down'));

  this.files = options.files.slice();
  if (this.files.length === 0) {
    return doneCallback('no files to test', this);
  }

  // Create wd browser instance
  if (local) {
    this.browser = wd.remote('localhost', options.seleniumPort);
  } else {
    var user = options.sauceUser || process.env.SAUCE_USERNAME;
    var key = options.sauceKey || process.env.SAUCE_ACCESS_KEY;
    this.browser = wd.remote('ondemand.saucelabs.com', 80, user, key);
  }

  // Setup browser logging
  if (options.verbose) {
    this.browser.on('status', function(info) {
      console.log(chalk.cyan(info));
    });
    this.browser.on('command', function(eventType, command, response) {
      console.log(' > ' + chalk.cyan(eventType), command, chalk.grey(response));
    });
    this.browser.on('http', function(meth, path, data) {
      console.log(' > ' + chalk.magenta(meth), path, chalk.grey(data));
    });
  }

  // Initialize the browser, then start tests
  this.browser.init(def, function(error, session, result) {
    if (error) {
      this.done(error);
    } else {
      this.reporter.emit('browser-init', {browser: this.def, session: session, result: result});
      this.testNextFile();
    }
  }.bind(this));
}

BrowserRunner.prototype.onEvent = function(data) {
  this.extendTimeout();

  if (data.event === 'browser-end') {
    this.done(data.error);
  } else {
    this.reporter.emit(data.event, data);
  }
};

BrowserRunner.prototype.done = function(error) {
  if (!error && this.files.length > 0) {
    return this.testNextFile();
  }

  if (this.timeoutId) clearTimeout(this.timeoutId);
  // Don't double-quit.
  if (!this.browser) return;
  var browser = this.browser;
  this.browser = null;

  var data = {browserId: this.def.id};
  if (error) data.error = error;
  this.reporter.emit('browser-end', data);

  browser.quit(function(quitError) {
    if (quitError) {
      this.reporter.emit('log', chalk.yellow('Failed to quit ' + this.def.browserName + '.', quitError));
    }

    this.doneCallback(error, this);
  }.bind(this));
};

BrowserRunner.prototype.extendTimeout = function() {
  if (this.timeoutId) clearTimeout(this.timeoutId);
  this.timeoutId = setTimeout(function() {
    this.done('Timed out');
  }.bind(this), this.timeout);
};

BrowserRunner.prototype.testNextFile = function() {
  var file = this.files.shift();
  var qs = ['?stream=' + (this.options.port), 'browser=' + this.def.id].join('&');
  var url = ['http://localhost:' + this.options.port, this.options.component, 'tests', file + qs].join('/');
  this.browser.get(url, function(error) {
    if (error) this.done(error.data || error);
  }.bind(this));
};

module.exports = BrowserRunner;
