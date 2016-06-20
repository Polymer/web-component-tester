/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as lodash from 'lodash';
import * as cleankill from 'cleankill';
import {expect} from 'chai';
import * as path from 'path';
import * as util from 'util';

import {Stats, BrowserDef} from '../../runner/browserrunner';
import {CliReporter, TestEndData, State, CompletedState} from '../../runner/clireporter';
import * as config from '../../runner/config';
import {Context} from '../../runner/context';
import * as steps from '../../runner/steps';
import {test} from '../../runner/test';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Assert that all browsers passed. */
function assertPassed(context: TestContext) {
  expect(context.runError).to.not.be.ok;
  expect(context.errors)
      .to.deep.equal(repeatBrowsers(context, null));
}

function assertFailed(context: TestContext, expectedError: any) {
  expect(context.runError).to.eq(expectedError);
  expect(context.errors)
      .to.deep.equal(repeatBrowsers(context, expectedError));
}

/** Asserts that all browsers match the given stats. */
function assertStats(context: TestContext, passing: number, pending: number, failing: number, status: 'complete') {
  const expected: Stats = {
      passing: passing, pending: pending, failing: failing, status: status};
  expect(context.stats).to.deep.equal(
      repeatBrowsers(context, expected));
}

/** Asserts that all browsers match the given test layout. */
function assertTests(context: TestContext, expected) {
  expect(context.tests).to.deep.equal(repeatBrowsers(context, expected));
}

/** Asserts that all browsers emitted the given errors. */
function assertTestErrors(context: TestContext, expected) {
  lodash.each(context.testErrors, function(actual, browser) {
    expect(Object.keys(expected)).to.have.members(
        Object.keys(actual), 'Test file mismatch for ' + browser);

    lodash.each(actual, function(errors, file) {
      const expectedErrors = expected[file];
      // Currently very dumb for simplicity: We don't support suites.
      expect(Object.keys(expectedErrors)).to.have.members(Object.keys(errors), 'Test failure mismatch for ' + file + ' on ' + browser);

      lodash.each(errors, function(error: Error, test: string) {
        const locationInfo  = ' for ' + file + '/' + test + ' on ' + browser;
        const expectedError = expectedErrors[test];
        const stackLines    = error.stack.split('\n');
        expect(error.message).to.eq(expectedError[0], 'Error message mismatch' + locationInfo);

        // Chai fails to emit stacks for Firefox.
        // https://github.com/chaijs/chai/issues/100
        if (browser.indexOf('firefox') !== -1) return;

        for (let i = 0; i < expectedError.length; i++) {
          const line = expectedError[i];
          const info = 'Stack line ' + i + ' mismatch' + locationInfo;
          if (typeof expectedError[i] === 'string') {
            expect(stackLines[i]).to.eq(expectedError[i], info);
          } else {
            expect(stackLines[i]).to.match(expectedError[i], info);
          }
        }
        expect(stackLines.length).to.eq(expectedError.length, 'Stack length mismatch.' + locationInfo);
      });
    });
  });
}

// Tests

/** Describes all suites, mixed into the environments being run. */
function runsAllIntegrationSuites() {

  runsIntegrationSuite('hybrid', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'inline suite': {
            'inline nested test': {
              'state': 'passing'
            },
          },
          'inline test': {
            'state': 'passing'
          },
          'suite': {
            'nested test': {
              'state': 'passing'
            },
          },
          'test': {
            'state': 'passing'
          },
        },
        'tests.html': {
          'suite': {
            'nested test': {
              'state': 'passing'
            },
          },
          'test': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('failing', function(testContext) {

    it('fails', function() {
      assertFailed(testContext, '3 failed tests');
      assertStats(testContext, 3, 0, 3, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'inline passing test': {
            'state': 'passing'
          },
          'inline failing test': {
            'state': 'failing',
          },
          'passing test': {
            'state': 'passing'
          },
          'failing test': {
            'state': 'failing',
          },
        },
        'tests.html': {
          'passing test': {
            'state': 'passing'
          },
          'failing test': {
            'state': 'failing',
          },
        },
      });
    });

    it('emits well formed errors', function() {
      assertTestErrors(testContext, {
        'index.html': {
          'inline failing test': [
            'expected false to be true',
            /^  .* at \/web-component-tester\/test\/fixtures\/integration\/failing\/index\.html:13$/,
          ],
          'failing test': [
            'expected false to be true',
            /^  .* at \/web-component-tester\/test\/fixtures\/integration\/failing\/tests\.js:3$/,
          ],
        },
        'tests.html': {
          'failing test': [
            'expected false to be true',
            /^  .* at \/web-component-tester\/test\/fixtures\/integration\/failing\/tests.html:11$/,
          ],
        },
      });
    });

  });

  runsIntegrationSuite('inline-js', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'suite': {
            'nested test': {
              'state': 'passing'
            },
          },
          'test': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('many-html', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'one.html': {
          'suite 1': {
            'nested test 1': {
              'state': 'passing'
            },
          },
          'test 1': {
            'state': 'passing'
          },
        },
        'two.html': {
          'suite 2': {
            'nested test 2': {
              'state': 'passing'
            },
          },
          'test 2': {
            'state': 'passing'
          },
        },
        'three.html': {
          'suite 3': {
            'nested test 3': {
              'state': 'passing'
            },
          },
          'test 3': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('many-js', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 6, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'suite 1': {
            'nested test 1': {
              'state': 'passing'
            },
          },
          'test 1': {
            'state': 'passing'
          },
          'suite 2': {
            'nested test 2': {
              'state': 'passing'
            },
          },
          'test 2': {
            'state': 'passing'
          },
          'suite 3': {
            'nested test 3': {
              'state': 'passing'
            },
          },
          'test 3': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('nested', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 4, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'js test': {
            'state': 'passing'
          },
        },
        'one/tests.html': {
          'test': {
            'state': 'passing'
          },
        },
        'two/': {
          'inline test': {
            'state': 'passing'
          },
        },
        'leaf.html': {
          'test': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('no-tests', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 0, 0, 0, 'complete');
    });

  });

  runsIntegrationSuite('one-html', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'tests.html': {
          'suite': {
            'nested test': {
              'state': 'passing'
            },
          },
          'test': {
            'state': 'passing'
          },
        },
      });
    });

  });

  runsIntegrationSuite('one-js', function(testContext) {

    it('passes', function() {
      assertPassed(testContext);
      assertStats(testContext, 2, 0, 0, 'complete');
    });

    it('runs the correct tests', function() {
      assertTests(testContext, {
        'index.html': {
          'suite': {
            'nested test': {
              'state': 'passing'
            },
          },
          'test': {
            'state': 'passing'
          },
        },
      });
    });

  });

}

// Environments

// Hacktastic state used in environments & helpers.
const currentEnv = {};

if (!process.env.SKIP_LOCAL_BROWSERS) {
  describe('Local Browsers', function() {
    before(function() {
      currentEnv['remote'] = false;
    });

    runsAllIntegrationSuites();
  });
}

// TODO(nevir): Re-enable support for integration in sauce.
/*
if (!process.env.SKIP_REMOTE_BROWSERS) {
  describe('Remote Browsers', function() {
    // Boot up a sauce tunnel w/ whatever the environment gives us.

    before(function(done) {
      this.timeout(300 * 1000);
      currentEnv.remote = true;

      const emitter = new Context();
      new CliReporter(emitter, process.stdout, {verbose: true});

      steps.ensureSauceTunnel(baseOptions, emitter, function(error, tunnelId) {
        baseOptions.sauce.tunnelId = tunnelId;
        done(error);
      });
    });

    runsAllIntegrationSuites();
  });

  after(function(done) {
    this.timeout(120 * 1000);
    cleankill.close(done);
  });
}
*/

// Helpers

function browserName(browser: BrowserDef) {
  const parts: string[] = [];

  if (browser.platform && !browser.deviceName) {
    parts.push(browser.platform);
  }

  parts.push(browser.deviceName || browser.browserName);

  if (browser.version) {
    parts.push(browser.version);
  }

  return parts.join(' ');
}

function repeatBrowsers(context: TestContext, data: Stats) {
  expect(Object.keys(context.stats).length).to.be.greaterThan(
      0, 'No browsers were run. Bad environment?');
  return lodash.mapValues(context.stats, () => data);
}

type TestNode = {
  state?: CompletedState;
  [subTestName: string]: TestNode | CompletedState;
}

class TestContext {
  tests: TestNode = {};
  testErrors: TestNode = {};
  stats: {[browserName: string]: Stats} = {};
  errors: {[browserName: string]: any} = {};
  runError: any;
}

/**
 * Creates a mocha context that runs an integration suite (once), and hangs onto
 * the output for tests.
 */
function runsIntegrationSuite(suiteName: string, contextFunction: (context: TestContext) => void) {
  describe(suiteName, function() {
    const log: string[] = [];
    class TestContext {
      tests: TestNode = {};
      testErrors: TestNode = {};
      stats: {[browserName: string]: Stats} = {};
      errors: {[browserName: string]: any} = {};
      runError: any;
    }
    const testContext = new TestContext();

    before(async function() {
      this.timeout(120 * 1000);

      const options: config.Config = {
        output:      <any>{write: log.push.bind(log)},
        ttyOutput:   false,
        skipCleanup: true,  // We do it manually at the end of all suites.
        root:        path.resolve(PROJECT_ROOT, '..'),
        suites:      [path.join(path.basename(PROJECT_ROOT), 'test/fixtures/integration', suiteName)],
        // TODO(nevir): Migrate
        // remote:      currentEnv.remote,
        // Roughly matches CI Runner statuses.
        browserOptions: {
          name: 'web-component-tester',
          tags: ['org:Polymer', 'repo:web-component-tester'],
        },
      };
      const config: config.Config = {
        output: <any>{write: log.push.bind(log)},
        ttyOutput: false,
        skipCleanup: true,
        root: path.resolve(PROJECT_ROOT, '..'),
        suites: [path.join(path.basename(PROJECT_ROOT), 'test/fixtures/integration', suiteName)],
        plugins: <any>{
          local: {browsers: ['chrome', 'safari']},
        }
      };
      const context = new Context(config);

      const addEventHandler = (name: string, handler: Function) => {
        context.on(name, function() {
          try {
            handler.apply(null, arguments);
          } catch (error) {
            console.error(`Error inside ${name} handler in integration tests:`);
            console.error(error.stack);
          }
        });
      };

      addEventHandler('test-end', (browserInfo: BrowserDef, data: TestEndData, stats: Stats) => {
        const browser = browserName(browserInfo);
        testContext.stats[browser] = stats;

        let testNode = <TestNode>(
            testContext.tests[browser] = testContext.tests[browser] || {});
        let errorNode =
            testContext.testErrors[browser] = testContext.testErrors[browser] || {};
        for (let i = 0; i < data.test.length; i++) {
          const name = data.test[i];
          testNode = <TestNode>(testNode[name] = testNode[name] || {});
          if (i < data.test.length - 1) {
            errorNode = errorNode[name] = errorNode[name] || {};
          } else if (data.error) {
            errorNode[name] = data.error;
          }
        }
        testNode.state = data.state;
      });

      addEventHandler('browser-end', (browserInfo: BrowserDef, error: any, stats: Stats) => {
        const browser = browserName(browserInfo);
        testContext.stats[browser] = stats;
        testContext.errors[browser] = error || null;  // falsy to null for easy check.
      });

      addEventHandler('run-end', (error: any) => {
        testContext.runError = error;
      });

      // Don't fail the integration suite on test errors.
      try {
        await test(context);
      } catch (error) {
        console.error(error.stack);
      }
    });

    afterEach(function() {
      if (this.currentTest.state !== 'failed') return;
      log.forEach((line) => process.stderr.write(line));
    });

    contextFunction(testContext);
  });
}
