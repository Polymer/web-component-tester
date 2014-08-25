var path = require('path');
var async = require('async');
var finalhandler = require('finalhandler')
var serveStatic = require('serve-static')
var http = require('http');
var io = require('socket.io');
var events = require('events');
var SauceTunnel = require('sauce-tunnel');
var extend = require('extend');
var argv = require('yargs').argv;
var freeport = require('freeport');
var seleniumLauncher = require('selenium-standalone');

var BrowserRunner = require('./lib/browserrunner');
var CliReporter   = require('./lib/clireporter');

// Main test running sequence
function runTests(reporter, server, local, browsers, options, doneCallback) {
  var runners = [];
  browsers = browsers.slice();
  if (browsers.length === 0) {
    return doneCallback('No browsers configured to run');
  }

  // Initialize default options
  options = extend({}, options);
  options.component = options.component || path.basename(process.cwd());
  options.files = options.files || ['runner.html'];

  // Setup socket.io for mocha streaming
  var ioserver = io(server);
  ioserver.on('connection', function(socket) {
    socket.on('client-event', function(data) {
      runners[data.browserId].onEvent(data);
    });
  });

  // Start browsers and wait for them to finish.
  reporter.emit('run-init', {browsers: browsers, options: options});

  var numComplete = 0;
  var failed = false;
  var done = function() {
    var error = failed ? 'There were test failures' : null;
    reporter.emit('run-end', error);
    doneCallback(error);
  };

  for (var i=0; i<browsers.length; i++) {
    browsers[i] = extend({id: i, 'tunnel-identifier': options.sauceTunnelId}, browsers[i]);
    runners.push(new BrowserRunner(reporter, local, browsers[i], options, function(err, browser) {
      if (err) {
        failed = true;
      }
      numComplete = numComplete + 1;
      if (numComplete === browsers.length) {
        done();
      }
    }));
  }
}

// Direct testing entry point
function test(local, browsers, options, doneCallback) {
  var tunnel;
  var selenium;
  var server;
  var reporter = new events.EventEmitter();
  options = extend({}, options);
  options.startTunnel = local ? false : (options.startTunnel === undefined ? true : options.startTunnel);
  options.startSelenium = local ? (options.startSelenium === undefined) : options.startSelenium;
  if (argv['only-browsers']) {
    browsers = argv['only-browsers'].toString().split(',').map(function(b) {
      return browsers[parseInt(b)-1];
    });
  }
  // Allow users to set up reporter listeners synchronously before starting anything
  setImmediate(function() {
    async.series([
      // Start sauce tunnel (remote only)
      function(next) {
        if (options.startTunnel) {
          var user = options.sauceUser || process.env.SAUCE_USERNAME;
          var key = options.sauceKey || process.env.SAUCE_ACCESS_KEY;
          options.sauceTunnelId = options.sauceTunnelId || 'Tunnel'+Date.now();
          tunnel = new SauceTunnel(user, key, options.sauceTunnelId, true, options.sauceTunnelOptions);
          reporter.emit('log', 'tunnel starting');
          tunnel.start(function(status) {
            if (status) {
              reporter.emit('log', 'tunnel started');
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
            reporter.emit('log', 'selenium starting on port', port);
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
      // Obtain free port for web server
      function(next) {
        if (!options.port) {
          freeport(function(err, port) {
            if (err) {
              next('Could not obtain port for web server: ' + err);
            } else {
              if (options.verbose) {
                console.log('Obtained web server port: ' + port);
              }
              options.port = port;
              next();
            }
          });
        } else {
          next();
        }
      },
      // Start web server
      function(next) {
        var root = options.root || path.join(process.cwd(), '..');
        var serve = serveStatic(root, {'index': ['index.html', 'index.htm']});
        server = http.createServer(function(req, res){
          var done = finalhandler(req, res);
          serve(req, res, done);
        });
        server.listen(options.port);
        next();
      },
      // Run the tests
      function(next) {
        runTests(reporter, server, local, browsers, options, next);
      }
    ],
    // Cleanup
    function(err) {
      if (server) {
        server.close();
      }
      if (selenium) {
        selenium.kill();
      }
      if (tunnel) {
        reporter.emit('log', 'tunnel stopping');
        tunnel.stop(function() {
          reporter.emit('log', 'tunnel stopped');
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
  options.verbose = options.verbose || argv.verbose;
  var browsersJson = path.join(process.cwd(), '../polymer-test-tools/ci-browsers.json');

  gulp.task('test-local', function(cb) {
    var reporter = test(true, options.browsers || require(browsersJson).local, options, cb);
    new CliReporter(reporter, process.stdout, options.verbose);
  });

  gulp.task('test-sauce', function(cb) {
    var reporter = test(false, options.browsers || require(browsersJson).remote, options, cb);
    new CliReporter(reporter, process.stdout, options.verbose);
  });
}

module.exports = {
  init: init,
  test: test
};
