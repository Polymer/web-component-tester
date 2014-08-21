require('colors');
var fs = require('fs');
var path = require('path');
var async = require('async');
var wd = require('wd');
var connect = require('gulp-connect');
var http = require('http');
var io = require('socket.io');
var events = require('events');
var gutil = require('gulp-util');
var SauceTunnel = require('sauce-tunnel');
var extend = require('extend');
var argv = require('yargs').argv;
var freeport = require('freeport');
var seleniumLauncher = require('selenium-standalone');

// Helper to get a fully-qualified string from a browser definition
function toBrowserString(browser) {
  return (browser.platform ? (browser.platform + ' ') : '') + 
    browser.browserName + 
    (browser.version ? (' ' + browser.version) : '');
}

// Browser abstraction, responsible for spinning up a browser instance via wd.js and
// executing runner.html test files passed in options.files
function BrowserRunner(reporter, local, def, options, doneCallback) {
  
  this.reporter = reporter;
  this.options = options;
  this.def = def;
  this.results = [];
  this.files = options.files.slice();
  
  this.doneCallback = function(err) {
    var data = {browser: this.def};
    if (err) {
      data.error = err;
    } else {
      data.results = this.results;
    }
    this.reporter.emit('browser stopped', data);
    this.browser.quit();
    doneCallback(err, this);
  };

  // Create wd browser instance
  if (local) {
    this.browser = wd.remote('localhost', options.seleniumPort);
  } else {
    var user = options.sauceUser || process.env.SAUCE_USERNAME;
    var key = options.sauceKey || process.env.SAUCE_ACCESS_KEY;
    this.browser = wd.remote('ondemand.saucelabs.com', 80, user, key);
  }

  // Setup browser logging
  if (argv.verbose) {
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
  browsers = browsers.slice();

  // Initialize default options
  options = extend({}, options);
  options.component = options.component || path.basename(process.cwd());
  options.files = options.files || ['runner.html'];

  // Setup socket.io v for mocha streaming
  var server = http.createServer();
  var ioserver = io(server);
  server.listen(options.port+1);
  ioserver.on('connection', function(socket) {
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
    if (server) {
      server.close();
    }
    doneCallback(null, results);
  };

  // Start browsers and wait for results
  reporter.emit('runner started', {browsers: browsers, options: options});
  for (var i=0; i<browsers.length; i++) {
    browsers[i] = extend({id: i, 'tunnel-identifier': options.sauceTunnelId}, browsers[i]);
    runners.push(new BrowserRunner(reporter, local, browsers[i], options, function(err, browser) {
      if (err) {
        results[browser.def.id] = {
          browser: browser.def,
          error: err.toString()
        };
      } else {
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
  var tunnel;
  var selenium;
  var serverOpen = false;
  var reporter = new events.EventEmitter();
  options = extend({}, options);
  options.port = options.port || 9998;
  options.startTunnel = local ? false : (options.startTunnel === undefined ? true : options.startTunnel);
  options.startSelenium = local ? (options.startSelenium === undefined) : options.startSelenium;
  if (argv['only-browsers']) {
    browsers = argv['only-browsers'].toString().split(',').map(function(b) {
      return browsers[parseInt(b)-1];
    });
  }
  // Allow users to set up reporter listeners
  setImmediate(function() {
    async.series([
      // Start sauce tunnel (remote only)
      function(next) {
        if (options.startTunnel) {
          var user = options.sauceUser || process.env.SAUCE_USERNAME;
          var key = options.sauceKey || process.env.SAUCE_ACCESS_KEY;
          options.sauceTunnelId = options.sauceTunnelId || 'Tunnel'+Date.now();
          tunnel = new SauceTunnel(user, key, options.sauceTunnelId, true, options.sauceTunnelOptions);
          reporter.emit('tunnel starting');
          tunnel.start(function(status) {
            if (status) {
              reporter.emit('tunnel started');
            }
            next(status ? null : 'Could not start sauce tunnel');
          });
        } else {
          next();
        }
      },
      // Start selenium (local only)
      function(next) {
        if (options.startSelenium) {
          freeport(function(err, port) {
            reporter.emit('selenium starting', {port: port});
            options.seleniumPort = port;
            selenium = seleniumLauncher({stdio: null}, ['-port', options.seleniumPort]);
            var badExit = function() { next('Could not start selenium'); };
            selenium.on('exit', badExit);
            selenium.stdout.on('data', function(data) {
              if (data.toString().indexOf('Started org.openqa.jetty.jetty.Server') > -1) {
                selenium.removeListener('exit', badExit);
                next();
              }
            });
          });
        } else {
          next();
        }
      },
      // Start web server
      function(next) {
        connect.server({
          root: options.root || path.join(process.cwd(), '..'),
          port: options.port
        });
        serverOpen = true;
        next();
      },
      // Run the tests
      function(next) {
        runTests(reporter, local, browsers, options, next);
      }
    ], 
    // Cleanup
    function(err) {
      if (serverOpen) {
        connect.serverClose();
      }
      if (selenium) {
        selenium.kill();
      }
      if (tunnel) {
        reporter.emit('tunnel stopping');
        tunnel.stop(function() {
          reporter.emit('tunnel stopped');
          doneCallback(err);
        });
      } else {
        doneCallback(err);        
      }
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
      gutil.log('Run started');
    });
    reporter.on('tunnel starting', function(data) {
      gutil.log('Tunnel starting...');
    });
    reporter.on('tunnel started', function(data) {
      gutil.log('Tunnel started');
    });
    reporter.on('selenium starting', function(data) {
      gutil.log('Selenium starting on port ' + data.port + '...');
    });
    reporter.on('selenium started', function(data) {
      gutil.log('Selenium started');
    });
    reporter.on('browser started', function(data) {
      gutil.log('Browser started: ' + toBrowserString(data.browser).cyan);
    });
    if (argv.verbose) {
      reporter.on('mocha event', function(data) {
        gutil.log('Mocha event: ' + data.event + ' ' + toBrowserString(data).cyan);
      });
    }
    reporter.on('mocha event', function(data) {
      if (data.event == 'fail') {
        gutil.log('Test failed: ' + toBrowserString(data).cyan + ': ' +
          '\n   ' + ('Test: ' + data.data.titles).red + 
          '\n   ' + ('Message: ' + data.data.message).red + 
          (data.data.stack ? '\n   ' + ('Stack: ' + data.data.stack.gray).red : ''));
      }
    });
    reporter.on('browser stopped', function(data) {
      gutil.log('Browser complete: ' + toBrowserString(data.browser).cyan + ': ' + 
        (data.error ? 'error'.red : (data.results[0].failures ? 'fail'.red : 'pass'.green)) + 
        (data.error ? ('\n   ' + data.error.toString().red) : ''));
    });
    reporter.on('runner stopped', function(data) {
      gutil.log('Run complete\n', data.results.map(function(r) { 
          return '   ' + (r.browser.id+1) + ': ' + toBrowserString(r.browser) + 
          ': ' + (r.error ? 'error'.red : (r.results[0].failures ? 'fail'.red : 'pass'.green));
        }).join('\n'));
    });
    reporter.on('tunnel stopping', function(data) {
      gutil.log('Tunnel stopping...');
    });
    reporter.on('tunnel stopped', function(data) {
      gutil.log('Tunnel stopped');
    });
  };
}

module.exports = {
  init: init,
  test: test
};