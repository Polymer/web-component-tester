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
import * as fs from 'fs';
import * as lodash from 'lodash';
import * as path from 'path';

import {BrowserDef, Stats} from '../../runner/browserrunner';
import {CompletedState, TestEndData} from '../../runner/clireporter';
import * as config from '../../runner/config';
import {Context} from '../../runner/context';
import {test} from '../../runner/test';
import {makeProperTestDir} from './setup_test_dir';

interface TestErrorExpectation {
  [fileName: string]: {
    // The test name mapped to the error
    [testName: string]: [string, string];
  };
}

type Golden = VariantsGolden|VariantResultGolden;

function isVariantsGolden(golden: Golden): golden is VariantsGolden {
  return !!golden['variants'];
}

interface VariantsGolden {
  variants: {[variantName: string]: VariantResultGolden};
}


interface VariantResultGolden {
  passing: number;
  pending: number;
  failing: number;
  status: string;
  tests: TestNode;
  errors: TestErrorExpectation;
}
type TestNode = {
  state?: CompletedState; [subTestName: string]: TestNode | CompletedState;
}

class TestResults {
  variants: {[variantName: string]: VariantResults} = {};
  runError: any = null;
  testRunnerError: any = null;

  getVariantResults(variantName: string): VariantResults {
    this.variants[variantName] =
        this.variants[variantName] || new VariantResults();
    return this.variants[variantName];
  }
}

class VariantResults {
  tests: TestNode = {};
  testErrors: TestNode = {};
  stats: {[browserName: string]: Stats} = {};
  errors: {[browserName: string]: any} = {};
}

// Tests

/** Describes all suites, mixed into the environments being run. */
function runsAllIntegrationSuites() {
  let integrationDirnames =
      fs.readdirSync(integrationDir).filter(fn => fn !== 'temp');
  // Overwrite integrationDirnames to run tests in isolation while developing:
  // integrationDirnames = ['components_dir'];

  // TODO(#421): `missing` correctly fails, but currently it times out which
  //     takes ~2 minutes.
  const suitesToSkip = new Set(['missing']);

  for (const fn of integrationDirnames) {
    runIntegrationSuiteForDir(fn, suitesToSkip.has(fn));
  }
}


function runIntegrationSuiteForDir(dirname: string, skip: boolean) {
  runsIntegrationSuite(dirname, skip, function(testResults) {
    const golden: Golden = JSON.parse(fs.readFileSync(
        path.join(integrationDir, dirname, 'golden.json'), 'utf-8'));

    let variantsGolden: VariantsGolden;
    if (isVariantsGolden(golden)) {
      variantsGolden = golden;
    } else {
      variantsGolden = {variants: {'': golden}};
    }

    it('ran the correct variants', function() {
      expect(Object.keys(testResults.variants).sort())
          .to.deep.equal(Object.keys(variantsGolden.variants).sort());
    });
    for (const variantName in variantsGolden.variants) {
      const run = () => assertVariantResultsConformToGolden(
          variantsGolden.variants[variantName],
          testResults.getVariantResults(variantName));
      if (variantName !== '') {
        describe(`the variant with bower_components-${variantName}`, run);
      } else {
        run();
      }
    }
  });
}



const integrationDir = path.resolve(__dirname, '../fixtures/integration');
/**
 * Creates a mocha context that runs an integration suite (once), and hangs onto
 * the output for tests.
 */
function runsIntegrationSuite(
    dirName: string, skip: boolean,
    contextFunction: (context: TestResults) => void) {
  const suiteName = `integration fixture dir '${dirName}'`;
  let describer: (suiteName: string, spec: () => void) => void = describe;
  if (skip) {
    describer = describe.skip;
  }
  describer(suiteName, function() {
    const log: string[] = [];
    const testResults = new TestResults();

    before(async function() {
      this.timeout(120 * 1000);

      const suiteRoot = await makeProperTestDir(dirName);
      const options: config.Config = {
        output: <any>{write: log.push.bind(log)},
        ttyOutput: false,
        root: suiteRoot,
        browserOptions: <any>{
          name: 'web-component-tester',
          tags: ['org:Polymer', 'repo:web-component-tester'],
        },
        plugins: <any>{
          local: {skipSeleniumInstall: true},
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
          (browserDef: BrowserDef, data: TestEndData, stats: Stats) => {
            const variantResults =
                testResults.getVariantResults(browserDef.variant || '');
            const browserName = getBrowserName(browserDef);
            variantResults.stats[browserName] = stats;

            let testNode = <TestNode>(
                variantResults.tests[browserName] =
                    variantResults.tests[browserName] || {});
            let errorNode = variantResults.testErrors[browserName] =
                variantResults.testErrors[browserName] || {};
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
          'browser-end', (browserDef: BrowserDef, error: any, stats: Stats) => {
            const variantResults =
                testResults.getVariantResults(browserDef.variant || '');
            const browserName = getBrowserName(browserDef);
            variantResults.stats[browserName] = stats;
            variantResults.errors[browserName] = error || null;
          });

      addEventHandler('run-end', (error: any) => {
        testResults.runError = error;
      });

      // Don't fail the integration suite on test errors.
      try {
        await test(context);
      } catch (error) {
        testResults.testRunnerError = error.message;
      }
    });

    afterEach(function() {
      if (this.currentTest.state === 'failed') {
        process.stderr.write(
            `\n    Output of wct for integration suite named \`${dirName}\`` +
            `\n` +
            `    ======================================================\n\n`);
        for (const line of log.join('').split('\n')) {
          process.stderr.write(`    ${line}\n`);
        }
        process.stderr.write(
            `\n    ======================================================\n\n`);
      }
    });

    contextFunction(testResults);
  });
}

if (!process.env.SKIP_LOCAL_BROWSERS) {
  describe('Local Browsers', function() {
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

/** Assert that all browsers passed. */
function assertPassed(context: TestResults) {
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
  // expect(context.errors).to.deep.equal(repeatBrowsers(context, null));
}

function assertFailed(context: VariantResults, expectedError: string) {
  // expect(context.runError).to.eq(expectedError);
  // expect(context.testRunnerError).to.be.eq(expectedError);
  expect(context.errors).to.deep.equal(repeatBrowsers(context, expectedError));
}

/** Asserts that all browsers match the given stats. */
function assertStats(
    context: VariantResults, passing: number, pending: number, failing: number,
    status: 'complete') {
  const expected: Stats = {passing, pending, failing, status};
  expect(context.stats).to.deep.equal(repeatBrowsers(context, expected));
}

/** Asserts that all browsers match the given test layout. */
function assertTests(context: VariantResults, expected: TestNode) {
  expect(context.tests).to.deep.equal(repeatBrowsers(context, expected));
}


/** Asserts that all browsers emitted the given errors. */
function assertTestErrors(
    context: VariantResults, expected: TestErrorExpectation) {
  lodash.each(context.testErrors, function(actual, browser) {
    expect(Object.keys(expected))
        .to.have.members(
            Object.keys(actual),
            'Test file mismatch for ' + browser +
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

function assertVariantResultsConformToGolden(
    golden: VariantResultGolden, variantResults: VariantResults) {
  // const variantResults = testResults.getVariantResults('');
  it('records the correct result stats', function() {
    try {
      assertStats(
          variantResults, golden.passing, golden.pending, golden.failing,
          <any>golden.status);
    } catch (_) {
      // mocha reports twice the failures because reasons
      // https://github.com/mochajs/mocha/issues/2083
      assertStats(
          variantResults, golden.passing, golden.pending, golden.failing * 2,
          <any>golden.status);
    }
  });

  if (golden.passing + golden.pending + golden.failing === 0 && !golden.tests) {
    return;
  }

  it('runs the correct tests', function() {
    assertTests(variantResults, golden.tests);
  });

  if (golden.errors || golden.failing > 0) {
    it('emits well formed errors', function() {
      assertTestErrors(variantResults, golden.errors);
    });
  }
  // it('passed the test', function() {
  //   assertPassed(testResults);
  // });
}

function getBrowserName(browser: BrowserDef) {
  const parts: string[] = [];
  if (browser.platform && !browser.deviceName) {
    parts.push(browser.platform);
  }

  parts.push(browser.deviceName || browser.browserName);

  if (browser.version) {
    parts.push(browser.version);
  }

  if (browser.variant) {
    parts.push(`[${browser.variant}]`);
  }

  return parts.join(' ');
}

function repeatBrowsers<T>(
    context: VariantResults, data: T): {[browserId: string]: T} {
  expect(Object.keys(context.stats).length)
      .to.be.greaterThan(0, 'No browsers were run. Bad environment?');
  return lodash.mapValues(context.stats, () => data);
}

describe('early failures', () => {
  it(`wct doesn't start testing if it's not bower installed locally`,
     async function() {
       this.timeout(20 * 1000);
       const log: string[] = [];
       const options: config.Config = {
         output: <any>{write: log.push.bind(log)},
         ttyOutput: false,
         root: path.join(
             __dirname, '..', 'fixtures', 'integration', 'components_dir'),
         browserOptions: <any>{
           name: 'web-component-tester',
           tags: ['org:Polymer', 'repo:web-component-tester'],
         },
         plugins: <any>{
           local: {
             // Uncomment to customize the browsers to test when debugging.
             //  browsers: ['firefox', 'chrome', 'safari'],
             skipSeleniumInstall: true
           },
         },
       };
       const context = new Context(options);
       try {
         await test(context);
         throw new Error('Expected test() to fail!');
       } catch (e) {
         expect(e.message).to.match(
             /The web-component-tester Bower package is not installed as a dependency of this project/);
       }
     });

  it('fails if the client side library is out of allowed version range',
     async function() {
       const log: string[] = [];
       const options: config.Config = {
         output: <any>{write: log.push.bind(log)},
         ttyOutput: false,
         root: path.join(__dirname, '..', 'fixtures', 'early-failure'),
         browserOptions: <any>{
           name: 'web-component-tester',
           tags: ['org:Polymer', 'repo:web-component-tester'],
         },
         plugins: <any>{
           local: {skipSeleniumInstall: true},
         },
       };
       const context = new Context(options);
       try {
         await test(context);
         throw new Error('Expected test() to fail!');
       } catch (e) {
         expect(e.message).to.match(
             /The web-component-tester Bower package installed is incompatible with the\n\s*wct node package you're using/);
       }
     });

});
