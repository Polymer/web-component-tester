/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
'use strict';

const _      = require('lodash');
const expect = require('chai').expect;
const sinon  = require('sinon');
const path   = require('path');

const cli   = require('../../runner/cli');
const steps = require('../../runner/steps');

const wctLocalBrowsers = require('wct-local/lib/browsers');

const FIXTURES = path.resolve(__dirname, '../fixtures/integration');

const LOCAL_BROWSERS = {
  aurora:  {browserName: 'aurora',  version: '1'},
  canary:  {browserName: 'canary',  version: '2'},
  chrome:  {browserName: 'chrome',  version: '3'},
  firefox: {browserName: 'firefox', version: '4'},
};

describe('cli', () => {

  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare',  (context) => Promise.resolve());
    sandbox.stub(steps, 'runTests', (context) => Promise.resolve());

    sandbox.stub(wctLocalBrowsers, 'detect', () => {
      return Promise.resolve(_.omit(LOCAL_BROWSERS, 'aurora'));
    });
    sandbox.stub(wctLocalBrowsers, 'supported', () => {
      return _.keys(LOCAL_BROWSERS);
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('.run', () => {
    const expectRun = function(env, args, logInput) {
      const log = logInput || [];
      return cli.run(env, args, {write: log.push.bind(log)}).then(
          () => steps.runTests.getCall(0),
          (error) => {
            log.forEach((line) => process.stderr.write(line));
            throw error;
          });
    }

    it('expands test/ by default, and serves from /components/<basename>', () => {
      process.chdir(path.join(FIXTURES, 'standard'));
      return expectRun({}, []).then((call) => {
        const options = call.args[0].options;
        expect(options.suites).to.have.members([
          'test/a.html',
          'test/b.js',
        ]);
        expect(options.root).to.equal(path.join(FIXTURES, 'standard'));
        expect(options.webserver.webRunnerPath).to.equal('/components/standard/generated-index.html');
      });
    });

    it('honors globs', () => {
      process.chdir(path.join(FIXTURES, 'standard'));

      return expectRun({}, ['**/*.html']).then((call) => {
        expect(call.args[0].options.suites).to.have.members([
          'test/a.html',
          'x-foo.html',
        ]);
      });
    });

    it('honors expanded files', () => {
      process.chdir(path.join(FIXTURES, 'standard'));

      return expectRun({}, ['test/b.js', 'x-foo.html']).then((call) => {
        expect(call.args[0].options.suites).to.have.members([
          'test/b.js',
          'x-foo.html',
        ]);
      });
    });

    it('honors --root with no specified suites', () => {
      process.chdir(__dirname);

      const root = path.join(FIXTURES, 'standard');
      return expectRun({}, ['--root', root]).then((call) => {
        expect(call.args[0].options.suites).to.have.members([
          'test/a.html',
          'test/b.js',
        ]);
        expect(call.args[0].options.root).to.equal(root);
      });
    });

    it('honors --root with specified suites', () => {
      process.chdir(__dirname);

      const root = path.join(FIXTURES, 'standard');
      return expectRun({}, ['--root', root, '**/*.html']).then((call) => {
        const options = call.args[0].options;
        expect(options.suites).to.have.members([
          'test/a.html',
          'x-foo.html',
        ]);
        expect(options.root).to.equal(root);
        expect(options.webserver.webRunnerPath).to.equal('/components/standard/generated-index.html');
      });
    });

    it('throws an error if no suites could be found', () => {
      return cli.run({}, ['404'], {write: () => {}}).then(
        () => fail('cli.run should have failed'),
        (error) => expect(error).to.match(/no.*suites.*found/i));
    });

    it('loads the local and sauce plugins by default', () => {
      process.chdir(path.join(FIXTURES, 'standard'));

      return expectRun({}, []).then((call) => {
        expect(call.args[0].enabledPlugins()).to.have.members(['local', 'sauce']);
      });
    });

    it('allows plugins to be diabled via --skip-plugin', () => {
      process.chdir(path.join(FIXTURES, 'standard'));

      return expectRun({}, ['--skip-plugin', 'sauce']).then((call) => {
        expect(call.args[0].enabledPlugins()).to.have.members(['local']);
      });
    });

    // TODO(nevir): Remove after deprecation period.
    it('throws an error when --webRunner is set', () => {
      return cli.run({}, ['--webRunner', 'foo'], {write: () => {}}).then(
        () => fail('cli.run should have failed'),
        (error) => {
          expect(error).to.include('webRunner');
          expect(error).to.include('suites');
        });
    });

    describe('with wct.conf.js', () => {
      const ROOT = path.join(FIXTURES, 'conf');

      it('serves from /components/<basename>', () => {
        process.chdir(ROOT);

        return expectRun({}, []).then((call) => {
          const options = call.args[0].options;
          expect(options.suites).to.have.members([
            'test/foo.js',
          ]);
          expect(options.root).to.equal(ROOT);
          expect(options.webserver.webRunnerPath).to.equal('/components/conf/generated-index.html');
        });
      });

      it('walks the ancestry', () => {
        process.chdir(path.join(ROOT, 'branch/leaf'));

        return expectRun({}, []).then((call) => {
          const options = call.args[0].options;
          expect(options.suites).to.have.members([
            'test/foo.js',
          ]);
          expect(options.root).to.equal(ROOT);
          expect(options.webserver.webRunnerPath).to.equal('/components/conf/generated-index.html');
        });
      });

      it('honors specified values', () => {
        process.chdir(ROOT);

        return expectRun({}, []).then((call) => {
          expect(call.args[0].options.plugins.sauce.username).to.eq('abc123');
        });
      });

      it('honors root', () => {
        process.chdir(path.join(ROOT, 'rooted'));

        return expectRun({}, []).then((call) => {
          const options = call.args[0].options;
          expect(options.suites).to.have.members([
            'integration/conf/test/foo.js',
          ]);
          expect(options.root).to.equal(path.dirname(FIXTURES));
          expect(options.webserver.webRunnerPath).to.equal('/components/fixtures/generated-index.html');
        });
      });

    });

    describe('deprecated flags', () => {

      beforeEach(() => {
        process.chdir(path.join(FIXTURES, 'standard'));
      });

      describe('--browsers', () => {

        it('warns when used', () => {
          const log = [];
          return expectRun({}, ['--browsers', 'firefox'], log).then((call) => {
            const hasWarning = _.any(log, (l) => /--browsers.*deprecated/i.test(l));
            expect(hasWarning).to.eq(true, 'Expected a warning that --browsers is deprecated');
          });
        });

        // Semi-integration test; this also checks that wct-local (mostly) works.
        it('supports local browsers', () => {
          return expectRun({}, ['--browsers', 'firefox', '-b', 'chrome']).then((call) => {
            const names = _.map(call.args[0].options.activeBrowsers, function(browser) {
              return browser.browserName;
            });
            expect(names).to.have.members(['firefox', 'chrome']);
          });
        });

        // Semi-integration test; this also checks that wct-sauce (mostly) works.
        it('supports sauce browsers', () => {
          return expectRun({}, ['--browsers', 'linux/firefox', '-b', 'linux/chrome']).then((call) => {
            const names = _.map(call.args[0].options.activeBrowsers, function(browser) {
              return browser.browserName;
            });
            expect(names).to.have.members(['firefox', 'chrome']);
          });
        });

      });

      describe('--remote', () => {

        it('warns when used', () => {
          const log = [];
          return expectRun({}, ['--remote'], log).then((call) => {
            const hasWarning = _.any(log, (l) => /--remote.*--sauce/.test(l));
            expect(hasWarning).to.eq(true, 'Expected a warning that --remote is deprecated');
          });
        });

        // Semi-integration test; this also checks that wct-sauce (mostly) works.
        it('sets up default sauce browsers', () => {
          return expectRun({}, ['--remote']).then((call) => {
            const platforms = call.args[0].options.activeBrowsers
                .map((browser) => browser.platform);
            expect(_.compact(platforms).length).to.be.gt(0);
          });
        });
      });
    });
  });
});
