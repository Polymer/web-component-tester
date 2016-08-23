/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

import {expect} from 'chai';
import * as cleankill from 'cleankill';
import * as fs from 'fs';
import * as lodash from 'lodash';
import * as path from 'path';
import * as util from 'util';

import {BrowserDef, Stats} from '../../runner/browserrunner';
import {CliReporter, CompletedState, State, TestEndData} from '../../runner/clireporter';
import * as config from '../../runner/config';
import {Context} from '../../runner/context';
import * as steps from '../../runner/steps';
import {test} from '../../runner/test';



/** Assert that all browsers passed. */
function assertPassed(context: TestContext) {
  if (context.runError) {
    console.error(
        context.runError.stack || context.runError.message || context.runError);
  }
  if (context.testRunnerError) {
    console.error(
        context.testRunnerError.stack || context.testRunnerError.message ||
        context.testRunnerError);
  }
  expect(context.runError).to.not.be.ok;
  expect(context.testRunnerError).to.not.be.ok;
  expect(context.errors).to.deep.equal(repeatBrowsers(context, null));
}

function assertFailed(context: TestContext, expectedError: string) {
  expect(context.runError).to.eq(expectedError);
  expect(context.errors).to.deep.equal(repeatBrowsers(context, expectedError));
}

/** Asserts that all browsers match the given stats. */
function assertStats(
    context: TestContext, passing: number, pending: number, failing: number,
    status: 'complete') {
  const expected: Stats = {passing, pending, failing, status};
  expect(context.stats).to.deep.equal(repeatBrowsers(context, expected));
}

/** Asserts that all browsers match the given test layout. */
function assertTests(context: TestContext, expected: TestNode) {
  expect(context.tests).to.deep.equal(repeatBrowsers(context, expected));
}

type TestErrorExpectation =
    {
      [fileName: string]: {[testName: string]: [string, string]}
    }

/** Asserts that all browsers emitted the given errors. */
function
assertTestErrors(context: TestContext, expected: TestErrorExpectation) {
  lodash.each(context.testErrors, function(actual, browser) {
    expect(Object.keys(expected))
        .to.have.members(
            Object.keys(actual), 'Test file mismatch for ' + browser +
                `: expected ${JSON
                    .stringify(Object.keys(expected))} - got ${JSON.stringify(
                        Object.keys(actual))}`);

    lodash.each(actual, function(errors, file) {
      const expectedErrors = expected[file];
      // Currently very dumb for simplicity: We don't support suites.
      expect(Object.keys(expectedErrors))
          .to.have.members(
              Object.keys(errors),
              `Test failure mismatch for ${file} on ${browser}`);

      lodash.each(errors, function(error: Error, test: string) {
        const locationInfo = `for ${file} - "${test}" on ${browser}`;
        const expectedError = expectedErrors[test];
        const stackLines = error.stack.split('\n');
        expect(error.message)
            .to.eq(expectedError[0], `Error message mismatch ${locationInfo}`);

        // Chai fails to emit stacks for Firefox.
        // https://github.com/chaijs/chai/issues/100
        if (browser.indexOf('firefox') !== -1) {
          return;
        }

        const expectedErrorText = expectedError[0];
        const stackTraceMatcher = expectedError[1];
        expect(stackLines[0]).to.eq(expectedErrorText);
        expect(stackLines[stackLines.length - 1])
            .to.match(new RegExp(stackTraceMatcher));
      });
    });
  });
}

// Tests

/** Describes all suites, mixed into the environments being run. */
function
runsAllIntegrationSuites() {

  // TODO(rictic): `missing` should fail.

  for (const fn of fs.readdirSync(integrationDir)) {
    runIntegrationSuiteForDir(fn);
  }
}

interface Golden {
  passing: number;
  pending: number;
  failing: number;
  status: string;
  tests: TestNode;
  errors: TestErrorExpectation;
}

function runIntegrationSuiteForDir(dirname: string) {
  runsIntegrationSuite(dirname, function(testContext) {
    const golden: Golden = JSON.parse(fs.readFileSync(
        path.join(integrationDir, dirname, 'golden.json'), 'utf-8'));

    it('records the correct result stats', function() {
      try {
        assertStats(
            testContext, golden.passing, golden.pending, golden.failing,
            <any>golden.status);
      } catch (_) {
        // mocha reports twice the failures because reasons
        // https://github.com/mochajs/mocha/issues/2083
        assertStats(
            testContext, golden.passing, golden.pending, golden.failing * 2,
            <any>golden.status);
      }
    });

    if (golden.passing + golden.pending + golden.failing === 0 &&
        !golden.tests) {
      return;
    }

    it('runs the correct tests', function() {
      assertTests(testContext, golden.tests);
    });

    if (!golden.errors) {
      return;
    }
    it('emits well formed errors', function() {
      assertTestErrors(testContext, golden.errors);
    });
  });
}

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

function repeatBrowsers<T>(
    context: TestContext, data: T): {[browserId: string]: T} {
  expect(Object.keys(context.stats).length)
      .to.be.greaterThan(0, 'No browsers were run. Bad environment?');
  return lodash.mapValues(context.stats, () => data);
}

type TestNode = {
  state?: CompletedState; [subTestName: string]: TestNode | CompletedState;
}

class TestContext {
  tests: TestNode = {};
  testErrors: TestNode = {};
  stats: {[browserName: string]: Stats} = {};
  errors: {[browserName: string]: any} = {};
  runError: any = null;
  testRunnerError: any = null;
}

const integrationDir = path.resolve(__dirname, '../fixtures/integration');
/**
 * Creates a mocha context that runs an integration suite (once), and hangs onto
 * the output for tests.
 */
function runsIntegrationSuite(
    suiteName: string, contextFunction: (context: TestContext) => void) {
  describe(suiteName, function() {
    const log: string[] = [];
    const testContext = new TestContext();

    before(async function() {
      this.timeout(120 * 1000);

      const suiteRoot = path.join(integrationDir, suiteName);
      const options: config.Config = {
        output: <any>{write: log.push.bind(log)},
        ttyOutput: false,
        skipCleanup: true,  // We do it manually at the end of all suites.
        root: suiteRoot,
        // TODO(nevir): Migrate
        // remote:      currentEnv.remote,
        // Roughly matches CI Runner statuses.
        browserOptions: <any>{
          name: 'web-component-tester',
          tags: ['org:Polymer', 'repo:web-component-tester'],
        },
        // Uncomment to customize the browsers to test when debugging.
        plugins: <any>{
          local: {
            // browsers: [/*'firefox'*/, 'chrome', /*'safari'*/],
            skipSeleniumInstall: true
          },
        },
      };
      const context = new Context(options);

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

      addEventHandler(
          'test-end',
          (browserInfo: BrowserDef, data: TestEndData, stats: Stats) => {
            const browser = browserName(browserInfo);
            testContext.stats[browser] = stats;

            let testNode = <TestNode>(
                testContext.tests[browser] = testContext.tests[browser] || {});
            let errorNode = testContext.testErrors[browser] =
                testContext.testErrors[browser] || {};
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

      addEventHandler(
          'browser-end',
          (browserInfo: BrowserDef, error: any, stats: Stats) => {
            const browser = browserName(browserInfo);
            testContext.stats[browser] = stats;
            testContext.errors[browser] = error || null;
          });

      addEventHandler('run-end', (error: any) => {
        testContext.runError = error;
      });

      // Don't fail the integration suite on test errors.
      try {
        await test(context);
      } catch (error) {
        testContext.testRunnerError = error;
      }
    });

    afterEach(function() {
      if (this.currentTest.state === 'failed') {
        process.stderr.write(
            `\n    Output of wct for integration suite named \`${suiteName}\`` +
            `\n` +
            `    ======================================================\n\n`);
        for (const line of log.join('').split('\n')) {
          process.stderr.write(`    ${line}\n`);
        }
        process.stderr.write(
            `\n    ======================================================\n\n`);
      }
    });

    contextFunction(testContext);
  });
}



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
