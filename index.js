require('colors');
var fs = require('fs');
var path = require('path');
var async = require('async');
var wd = require('wd');
var connect = require('gulp-connect');
var http = require('http');
var io = require('socket.io');
var events = require('events');
var verbose = false;
var gutil = require('gulp-util');

// Browser abstraction, responsible for spinning up a browser instance via wd.js and
// executing runner.html test files passed in options.files
function BrowserRunner(reporter, local, def, options, doneCallback) {
  
  this.reporter = reporter;
  this.options = options;
  this.def = def;
  this.results = [];
  this.files = options.files.slice();
  
  this.doneCallback = function(err) {
    doneCallback(err, this);
    this.reporter.emit('browser stopped', {browser: this.def});
    this.browser.quit();
  };

  // Create wd browser instance
  if (local) {
    this.browser = wd.remote();
  } else {
    this.browser = wd.remote('ondemand.saucelabs.com', 80, 
        process.env.SAUCE_USERNAME, process.env.SAUCE_ACCESS_KEY);
  }

  // Setup browser logging
  if (verbose) {
    this.browser.on('status', function(info) {
      console.log(info.cyan);
    });
    this.browser.on('command', function(eventType, command, response) {
      console.log(' > ' + eventType.cyan, command, (response || '').grey);
    });
    this.browser.on('http', function(meth, path, data) {
      console.log(' > ' + meth.magenta, path, (data || '').grey);
    });
  }

  // Initialize the browser, then start tests
  this.browser.init(def, function(err, session, result) {
    if (err) {
      this.doneCallback(err);
    } else {
      this.reporter.emit('browser started', {browser: this.def, session: session, result: result});
      this.testNextFile();
    }
  }.bind(this));
}
BrowserRunner.prototype.onEvent = function(data) {
  this.test.extendTimeout();
  if (data.event == 'end') {
    this.test.setResults(data.data);
  }
};
BrowserRunner.prototype.testNextFile = function() {
  var file = this.files.shift();
  if (!file) {
    this.doneCallback(null);
  } else {
    var qs = ['?stream=' + (this.options.port+1), 'browser=' + this.def.id].join('&');
    var url = ['http://localhost:' + this.options.port, this.options.component, 'tests', file + qs].join('/');
    this.test = new TestRunner(this.browser, url, false, function(err, res) {
      if (err) {
        this.doneCallback(err);
      } else {
        this.results.push({
          file: file,
          results: this.test.results
        });
        this.testNextFile();
      }
    }.bind(this));
  }
};

// Abstraction around a single test runner.html to be run on a given browser
function TestRunner(browser, url, shouldPoll, doneCallback) {
  this.timeout = 1000 * 30;
  this.doneCallback = doneCallback;
  this.browser = browser;
  async.series([
    function(next) {
      browser.get(url, next);
    }, function(next) {
      // Legacy support for polled results -- currently unused 
      if (shouldPoll) {
        this.waitForResults();
      } else {
        this.extendTimeout();
      }
    }.bind(this)
  ], doneCallback);
}
// Polled results
TestRunner.prototype.waitForResults = function() {
  this.resultsTimeout = Date.now() + this.timeout;
  this.pollResult();
};
TestRunner.prototype.pollResult = function() {
  this.browser.eval("window.mochaResults", function(err, res) {
    if (res) {
      this.results = res;
      this.doneCallback(null, this);
    } else {
      if (Date.now() < this.resultsTimeout) {
        setTimeout(this.pollResult.bind(this), 1000);
      } else {
        this.doneCallback('Timed out waiting for mochaResults');
      }
    }
  }.bind(this));
};
// Event-based results
TestRunner.prototype.setResults = function(results) {
  this.results = results;
  this.resetTimeout();
  this.doneCallback();
};
TestRunner.prototype.resetTimeout = function() {
  if (this.timeoutId) {
    clearTimeout(this.timeoutId);
  }
};
TestRunner.prototype.extendTimeout = function() {
  this.resetTimeout();
  this.timeoutId = setTimeout(function() {
    this.doneCallback('Timed out waiting for mochaResults');
  }.bind(this), this.timeout);
};

// Main test running sequence
function runTests(reporter, local, browsers, options, doneCallback) {
  var results = [];
  var runners = [];

  // Initialize default options
  options = options || {};
  options.component = options.component || path.basename(process.cwd());
  options.files = options.files || ['runner.html'];

  // Setup socket.io v for mocha streaming
  var server = http.createServer();
  var ioserver = io(server);
  var sockets = [];
  server.listen(options.port+1);
  ioserver.on('connection', function(socket) {
    sockets.push(socket);
    socket.on('close', function() {
      sockets.splice(sockets.indexOf(socket), 1);
    });
    socket.on('mocha event', function(data) {
      // Notify browser runner of test start/completion
      var browserRunner = runners[data.browser];
      browserRunner.onEvent(data);
      // Notify any external listeners
      var browser = browsers[data.browser];
      data.browserName = browser.browserName;
      data.platform = browser.platform;
      data.version = browser.version;
      reporter.emit('mocha event', data);
    });
  });

  // Performs end-of-run cleanup
  var done = function() {      
    reporter.emit('runner stopped', {results: results});
    server.close();
    sockets.forEach(function(socket) {
      socket.destroy();
    });
    doneCallback(null, results);
  };

  // Start browsers and wait for results
  reporter.emit('runner started', {browsers: browsers, options: options});
  for (var i=0; i<browsers.length; i++) {
    browsers[i].id = i;
    runners.push(new BrowserRunner(reporter, local, browsers[i], options, function(err, browser) {
      if (err) {
        results[browser.def.id] = {
          browser: browser.def,
          error: err.toString()
        };
      } else {
        var r = browser.results[0].results;
        results[browser.def.id] = {
          browser: browser.def,
          results: browser.results
        };
      }
      var total = 0;
      for (var j=0; j<browsers.length; j++) {
        total += results[j] ? 1 : 0;
      }
      if (total == browsers.length) {
        done();
      }
    }));
  }
  if (!browsers.length) {
    done();
  }
}

// Direct testing entry point
function test(local, browsers, options, doneCallback) {
  options = options || {};
  var reporter = new events.EventEmitter();
  // Allow users to set up reporter listeners
  setImmediate(function() {
    async.series([
      function(next) {
        connect.server({
          root: options.root || path.join(process.cwd(), '..'),
          port: options.port || 9998
        });
        runTests(reporter, local, browsers, options, next);
      }
    ], function(err) {
      connect.serverClose();
      doneCallback();
    });
  });
  return reporter;
}

// Gulp task initialization entry point
function init(gulp, options) {
  options = options || {};
  var browsersJson = path.join(process.cwd(), '../polymer-test-tools/ci-browsers.json');
  gulp.task('test-local', function(cb) {
    var reporter = test(true, options.browsers || require(browsersJson).local, options, cb);
    setupReporter(reporter);
  });
  gulp.task('test-sauce', function(cb) {
    var reporter = test(false, options.browsers || require(browsersJson).remote, options, cb);
    setupReporter(reporter);
  });
  var setupReporter = function(reporter) {
    reporter.on('runner started', function(data) {
      gutil.log('Runner started');
    });
    reporter.on('browser started', function(data) {
      gutil.log('Browser started: ', data.browser.platform, data.browser.browserName);
    });
    reporter.on('mocha event', function(data) {
      gutil.log('Mocha event: ', data.event, data.browser.platform, data.browser.browserName);
    });
    reporter.on('browser stopped', function(data) {
      gutil.log('Browser stopped: ', data.browser.platform, data.browser.browserName);
    });
    reporter.on('runner stopped', function(data) {
      gutil.log('Runner stopped');
    });
  };
}

module.exports = {
  init: init,
  test: test
};