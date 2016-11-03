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

import * as chai from 'chai';
import * as _ from 'lodash';
import * as path from 'path';
import * as sinon from 'sinon';

import * as cli from '../../runner/cli';
import * as context from '../../runner/context';
import * as steps from '../../runner/steps';

const expect = chai.expect;

const wctLocalBrowsers = require('wct-local/lib/browsers');

const FIXTURES = path.resolve(__dirname, '../fixtures/cli');

const LOCAL_BROWSERS = {
  aurora: {browserName: 'aurora', version: '1'},
  canary: {browserName: 'canary', version: '2'},
  chrome: {browserName: 'chrome', version: '3'},
  firefox: {browserName: 'firefox', version: '4'},
};

describe('cli', () => {

  let sandbox: sinon.SinonSandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare', async() => undefined);
    sandbox.stub(steps, 'runTests', async() => undefined);

    sandbox.stub(
        wctLocalBrowsers, 'detect',
        async() => _.omit(LOCAL_BROWSERS, 'aurora'));
    sandbox.stub(wctLocalBrowsers, 'supported', () => _.keys(LOCAL_BROWSERS));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('.run', () => {
    const expectRun = async(args: string[], logInput?: string[]) => {
      const log = logInput || [];
      const stream = <NodeJS.WritableStream><any>{write: log.push.bind(log)};
      try {
        await cli.run({}, args, stream);
      } catch (error) {
        log.forEach((line) => process.stderr.write(line));
        throw error;
      }
      const call = <{args: [context.Context]}>steps.runTests['getCall'](0);
      return call.args[0];
    };

    it('expands test/ by default, ' +
           'and serves from /components/<basename>',
       async() => {
         process.chdir(path.join(FIXTURES, 'standard'));
         const options = (await expectRun([])).options;
         expect(options.suites).to.have.members([
           'test/a.html',
           'test/b.js',
         ]);
         expect(options.root).to.equal(path.join(FIXTURES, 'standard'));
       });

    it('honors globs', async() => {
      process.chdir(path.join(FIXTURES, 'standard'));

      const options = (await expectRun(['**/*.html'])).options;
      expect(options.suites).to.have.members([
        'test/a.html',
        'x-foo.html',
      ]);
    });

    it('honors expanded files', async() => {
      process.chdir(path.join(FIXTURES, 'standard'));

      const options = (await expectRun(['test/b.js', 'x-foo.html'])).options;
      expect(options.suites).to.have.members([
        'test/b.js',
        'x-foo.html',
      ]);
    });

    it('honors --root with no specified suites', async() => {
      process.chdir(__dirname);

      const root = path.join(FIXTURES, 'standard');
      const options = (await expectRun(['--root', root])).options;
      expect(options.suites).to.have.members([
        'test/a.html',
        'test/b.js',
      ]);
      expect(options.root).to.equal(root);
    });

    it('honors --root with specified suites', async() => {
      process.chdir(__dirname);

      const root = path.join(FIXTURES, 'standard');
      const options = (await expectRun(['--root', root, '**/*.html'])).options;
      expect(options.suites).to.have.members([
        'test/a.html',
        'x-foo.html',
      ]);
      expect(options.root).to.equal(root);
    });

    it('throws an error if no suites could be found', async() => {
      try {
        await cli.run({}, ['404'], <any>{write: () => {}});
      } catch (error) {
        expect(error).to.match(/no.*suites.*found/i);
        return;
      }
      throw new Error('cli.run should have failed');
    });

    it('loads the local and sauce plugins by default', async() => {
      process.chdir(path.join(FIXTURES, 'standard'));

      const context = await expectRun([]);
      expect(context.enabledPlugins()).to.have.members(['local', 'sauce']);
    });

    it('allows plugins to be diabled via --skip-plugin', async() => {
      process.chdir(path.join(FIXTURES, 'standard'));

      const context = await expectRun(['--skip-plugin', 'sauce']);
      expect(context.enabledPlugins()).to.have.members(['local']);
    });

    // TODO(nevir): Remove after deprecation period.
    it('throws an error when --webRunner is set', () => {
      return cli.run({}, ['--webRunner', 'foo'], <any>{write: () => {}})
          .then(
              () => {
                throw new Error('cli.run should have failed');
              },
              (error) => {
                expect(error.message).to.include('webRunner');
                expect(error.message).to.include('suites');
              });
    });

    describe('with wct.conf.js', () => {
      const ROOT = path.join(FIXTURES, 'conf');

      it('serves from /components/<basename>', async() => {
        process.chdir(ROOT);

        const options = (await expectRun([])).options;
        expect(options.suites).to.have.members([
          'test/foo.js',
        ]);
        expect(options.root).to.equal(ROOT);
      });

      it('walks the ancestry', async() => {
        process.chdir(path.join(ROOT, 'branch/leaf'));

        const options = (await expectRun([])).options;
        expect(options.suites).to.have.members([
          'test/foo.js',
        ]);
        expect(options.root).to.equal(ROOT);
      });

      it('honors specified values', async() => {
        process.chdir(ROOT);

        const options = (await expectRun([])).options;
        expect(options.plugins['sauce'].username).to.eq('abc123');
      });

      it('honors root', async() => {
        process.chdir(path.join(ROOT, 'rooted'));

        const options = (await expectRun([])).options;
        expect(options.suites).to.have.members([
          'cli/conf/test/foo.js',
        ]);
        expect(options.root).to.equal(path.dirname(FIXTURES));
      });
    });

    describe('deprecated flags', () => {

      beforeEach(() => {
        process.chdir(path.join(FIXTURES, 'standard'));
      });

      describe('--browsers', () => {

        it('warns when used', async() => {
          const log: string[] = [];
          await expectRun(['--browsers', 'firefox'], log);
          const hasWarning =
              _.some(log, (l) => /--browsers.*deprecated/i.test(l));
          expect(hasWarning)
              .to.eq(true, 'Expected a warning that --browsers is deprecated');
        });

        // Semi-integration test.
        // This also checks that wct-local (mostly) works.
        it('supports local browsers', async() => {
          const args = ['--browsers', 'firefox', '-b', 'chrome'];
          const options = (await expectRun(args)).options;
          const names =
              options.activeBrowsers.map((browser) => browser.browserName);
          expect(names).to.have.members(['firefox', 'chrome']);
        });

        // Semi-integration test.
        // This also checks that wct-sauce (mostly) works.
        it('supports sauce browsers', async() => {
          const args = ['--browsers', 'linux/firefox', '-b', 'linux/chrome'];
          const options = (await expectRun(args)).options;
          const names =
              options.activeBrowsers.map((browser) => browser.browserName);
          expect(names).to.have.members(['firefox', 'chrome']);
        });

      });

      describe('--remote', () => {

        it('warns when used', async() => {
          const log: string[] = [];
          await expectRun(['--remote'], log);
          const hasWarning = _.some(log, (l) => /--remote.*--sauce/.test(l));
          expect(hasWarning)
              .to.eq(true, 'Expected a warning that --remote is deprecated');
        });

        // Semi-integration test.
        // This also checks that wct-sauce (mostly) works.
        it('sets up default sauce browsers', async() => {
          const options = (await expectRun(['--remote'])).options;
          const platforms =
              options.activeBrowsers.map((browser) => browser.platform);
          expect(_.compact(platforms).length).to.be.gt(0);
        });
      });
    });
  });
});
