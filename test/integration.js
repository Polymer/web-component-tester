var _            = require('lodash');
var EventEmitter = require('events').EventEmitter;
var expect       = require('chai').expect;
var path         = require('path');

var CLIReporter = require('../runner/clireporter');
var config      = require('../runner/config');
var steps       = require('../runner/steps');

/** Assert that all browsers passed. */
function assertPassed(context) {
  expect(context.runError).to.not.be.ok;
  expect(context.errors).to.deep.equal(repeatBrowsers(context, null));
}

/** Asserts that all browsers match the given stats. */
function assertStats(context, passing, pending, failing, status) {
  var expected = {passing: passing, pending: pending, failing: failing, status: status};
  expect(context.stats).to.deep.equal(repeatBrowsers(context, expected));
}

/** Asserts that all browsers match the given test layout. */
function assertTests(context, expected) {
  expect(context.tests).to.deep.equal(repeatBrowsers(context, expected));
}

// Tests

/** Describes all suites, mixed into the environments being run. */
function runsAllIntegrationSuites() {

  runsIntegrationSuite('hybrid', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "index.html": {
          "inline suite": {
            "inline nested test": {
              "state": "passing"
            },
          },
          "inline test": {
            "state": "passing"
          },
          "suite": {
            "nested test": {
              "state": "passing"
            },
          },
          "test": {
            "state": "passing"
          },
        },
        "tests.html": {
          "suite": {
            "nested test": {
              "state": "passing"
            },
          },
          "test": {
            "state": "passing"
          },
        },
      });
    });

  });

  runsIntegrationSuite('inline-js', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "index.html": {
          "suite": {
            "nested test": {
              "state": "passing"
            },
          },
          "test": {
            "state": "passing"
          },
        },
      });
    });

  });

  runsIntegrationSuite('many-html', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "one.html": {
          "suite 1": {
            "nested test 1": {
              "state": "passing"
            },
          },
          "test 1": {
            "state": "passing"
          },
        },
        "two.html": {
          "suite 2": {
            "nested test 2": {
              "state": "passing"
            },
          },
          "test 2": {
            "state": "passing"
          },
        },
        "three.html": {
          "suite 3": {
            "nested test 3": {
              "state": "passing"
            },
          },
          "test 3": {
            "state": "passing"
          },
        },
      });
    });

  });

  runsIntegrationSuite('many-js', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "index.html": {
          "suite 1": {
            "nested test 1": {
              "state": "passing"
            },
          },
          "test 1": {
            "state": "passing"
          },
          "suite 2": {
            "nested test 2": {
              "state": "passing"
            },
          },
          "test 2": {
            "state": "passing"
          },
          "suite 3": {
            "nested test 3": {
              "state": "passing"
            },
          },
          "test 3": {
            "state": "passing"
          },
        },
      });
    });

  });

  runsIntegrationSuite('no-tests', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 0, 0, 0, 'complete');
    });

  });

  runsIntegrationSuite('one-html', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "tests.html": {
          "suite": {
            "nested test": {
              "state": "passing"
            },
          },
          "test": {
            "state": "passing"
          },
        },
      });
    });

  });

  runsIntegrationSuite('one-js', function() {

    it('passes', function() {
      assertPassed(this);
      assertStats(this, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(this, {
        "index.html": {
          "suite": {
            "nested test": {
              "state": "passing"
            },
          },
          "test": {
            "state": "passing"
          },
        },
      });
    });

  });

}

// Environments

// Hacktastic state used in environments & helpers.
var currentEnv  = {};
var baseOptions = config.fromEnv(process.env, [], process.stderr);

if (!process.env.SKIP_LOCAL_BROWSERS) {
  describe('Local Browsers', function() {
    before(function() {
      currentEnv.remote = false;
    });

    runsAllIntegrationSuites();
  });
}

if (!process.env.SKIP_REMOTE_BROWSERS) {
  describe('Remote Browsers', function() {
    // Boot up a sauce tunnel w/ whatever the environment gives us.

    before(function(done) {
      this.timeout(120 * 1000);
      currentEnv.remote = true;

      var emitter = new EventEmitter();
      new CLIReporter(emitter, process.stdout, {});

      steps.ensureSauceTunnel(baseOptions, emitter, function(error, tunnelId) {
        baseOptions.sauce.tunnelId = tunnelId;
        done(error);
      });
    });

    runsAllIntegrationSuites();
  });
}

// Helpers

function browserName(browser) {
  parts = [];

  if (browser.platform && !browser.deviceName) {
    parts.push(browser.platform);
  }

  parts.push(browser.deviceName || browser.browserName);

  if (browser.version) {
    parts.push(browser.version);
  }

  return parts.join(' ');
}

function repeatBrowsers(context, data) {
  expect(Object.keys(context.stats).length).to.be.greaterThan(0, 'No browsers were run. Bad environment?');
  return _.mapValues(context.stats, function() { return data });
}

/**
 * Creates a mocha context that runs an integration suite (once), and hangs onto
 * the output for tests.
 */
function runsIntegrationSuite(suiteName, contextFunction) {
  describe(suiteName, function() {
    var log = [];

    before(function(done) {
      this.timeout(120 * 1000);

      var emitter = new EventEmitter();
      var stream  = {write: log.push.bind(log)};
      this.reporter = new CLIReporter(emitter, stream, {verbose: true, ttyOutput: false});

      var options = _.merge(config.defaults(), {
        root:      path.resolve(__dirname, '../..'),
        webRunner: path.join('test', 'fixtures', 'Integration', suiteName, 'index.html'),
        remote:    currentEnv.remote,
        sauce:     baseOptions.sauce,
        // Roughly matches CI Runner statuses.
        browserOptions: {
          name: 'web-component-tester',
          tags: ['org:Polymer', 'repo:web-component-tester'],
        },
      });

      this.tests = {};
      emitter.on('test-end', function(browserInfo, data, stats) {
        var browser = browserName(browserInfo);
        this.stats[browser] = stats;

        var root = this.tests[browser] = this.tests[browser] || {};
        for (var i = 0, name; name = data.test[i]; i++) {
          root[name] = root[name] || {};
          root = root[name];
        }
        root.state = data.state;
      }.bind(this));

      this.stats  = {};
      this.errors = {};
      emitter.on('browser-end', function(browserInfo, error, stats) {
        var browser = browserName(browserInfo);
        this.stats[browser]  = stats;
        this.errors[browser] = error || null;  // falsy to null for easy check.
      }.bind(this));

      emitter.on('run-end', function(error) {
        this.runError = error;
      }.bind(this));

      steps.runTests(options, emitter, done);
    });

    afterEach(function() {
      if (this.currentTest.state !== 'failed') return;
      log.forEach(function(line) { process.stderr.write(line); });
    });

    contextFunction();
  });
}
