var _      = require('lodash');
var async  = require('async');
var expect = require('chai').expect;
var sinon  = require('sinon');
var path   = require('path');

var cli   = require('../../runner/cli');
var steps = require('../../runner/steps');

var wctLocalBrowsers = require('wct-local/lib/browsers');

var FIXTURES = path.resolve(__dirname, '../fixtures/integration');

var LOCAL_BROWSERS = {
  aurora:  {browserName: 'aurora',  version: '1'},
  canary:  {browserName: 'canary',  version: '2'},
  chrome:  {browserName: 'chrome',  version: '3'},
  firefox: {browserName: 'firefox', version: '4'},
};

describe('cli', function() {

  var sandbox;
  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare',  function(context, done) { done(); });
    sandbox.stub(steps, 'runTests', function(context, done) { done(); });

    sandbox.stub(wctLocalBrowsers, 'detect', function(done) {
      done(null, _.omit(LOCAL_BROWSERS, 'aurora'));
    });
    sandbox.stub(wctLocalBrowsers, 'supported', function() {
      return _.keys(LOCAL_BROWSERS);
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('.run', function() {

    function expectRun(env, args, done) {
      var log    = [];
      var stream = {write: log.push.bind(log)};

      cli.run(env, args, stream, function(error) {
        if (error) {
          log.forEach(function(line) { process.stderr.write(line); });
          expect(error).to.not.be.ok;
        }
        done(steps.runTests.getCall(0));
      });

      return log;
    }

    it('expands test/ by default, and serves from the parent', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, [], function(call) {
        expect(call.args[0].options.suites).to.have.members([
          'standard/test/a.html',
          'standard/test/b.js',
        ]);
        expect(call.args[0].options.root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors globs', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, ['**/*.html'], function(call) {
        expect(call.args[0].options.suites).to.have.members([
          'standard/test/a.html',
          'standard/x-foo.html',
        ]);
        expect(call.args[0].options.root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors expanded files', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, ['test/b.js', 'x-foo.html'], function(call) {
        expect(call.args[0].options.suites).to.have.members([
          'standard/test/b.js',
          'standard/x-foo.html',
        ]);
        expect(call.args[0].options.root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors --root with no specified suites', function(done) {
      process.chdir(__dirname);

      var root = path.join(FIXTURES, 'standard');
      expectRun({}, ['--root', root], function(call) {
        expect(call.args[0].options.suites).to.have.members([
          'test/a.html',
          'test/b.js',
        ]);
        expect(call.args[0].options.root).to.equal(root);
        done();
      });
    });

    it('honors --root with specified suites', function(done) {
      process.chdir(__dirname);

      var root = path.join(FIXTURES, 'standard');
      expectRun({}, ['--root', root, '**/*.html'], function(call) {
        expect(call.args[0].options.suites).to.have.members([
          'test/a.html',
          'x-foo.html',
        ]);
        expect(call.args[0].options.root).to.equal(root);
        done();
      });
    });

    it('throws an error if no suites could be found', function(done) {
      cli.run({}, ['404'], {write: function() {}}, function(error) {
        expect(error).to.match(/no.*suites.*found/i);
        done();
      });
    });

    it('loads the local and sauce plugins by default', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, [], function(call) {
        expect(call.args[0].enabledPlugins()).to.have.members(['local', 'sauce']);
        done();
      });
    });

    it('allows plugins to be diabled via --skip-plugin', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, ['--skip-plugin', 'sauce'], function(call) {
        expect(call.args[0].enabledPlugins()).to.have.members(['local']);
        done();
      });
    });

    // TODO(nevir): Remove after deprecation period.
    it('throws an error when --webRunner is set', function(done) {
      cli.run({}, ['--webRunner', 'foo'], {write: function() {}}, function(error) {
        expect(error).to.include('webRunner');
        expect(error).to.include('suites');
        done();
      });
    });

    describe('with wct.conf.js', function() {
      var ROOT = path.join(FIXTURES, 'conf');

      it('serves from parent', function(done) {
        process.chdir(ROOT);

        expectRun({}, [], function(call) {
          expect(call.args[0].options.suites).to.have.members([
            'conf/test/foo.js',
          ]);
          expect(call.args[0].options.root).to.equal(FIXTURES);
          done();
        });
      });

      it('walks the ancestry', function(done) {
        process.chdir(path.join(ROOT, 'branch/leaf'));

        expectRun({}, [], function(call) {
          expect(call.args[0].options.suites).to.have.members([
            'conf/test/foo.js',
          ]);
          expect(call.args[0].options.root).to.equal(FIXTURES);
          done();
        });
      });

      it('honors specified values', function(done) {
        process.chdir(ROOT);

        expectRun({}, [], function(call) {
          expect(call.args[0].options.plugins.sauce.username).to.eq('abc123');
          done();
        });
      });

      it('honors root', function(done) {
        process.chdir(path.join(ROOT, 'rooted'));

        expectRun({}, [], function(call) {
          expect(call.args[0].options.suites).to.have.members([
            'integration/conf/test/foo.js',
          ]);
          expect(call.args[0].options.root).to.equal(path.dirname(FIXTURES));
          done();
        });
      });

    });

    describe('deprecated flags', function() {

      beforeEach(function() {
        process.chdir(path.join(FIXTURES, 'standard'));
      });

      describe('--browsers', function() {

        it('warns when used', function(done) {
          var log = expectRun({}, ['--browsers', 'firefox'], function(call) {
            var hasWarning = _.any(log, function(l) { return /--browsers.*deprecated/i.test(l); });
            expect(hasWarning).to.eq(true, 'Expected a warning that --browsers is deprecated');
            done();
          });
        });

        // Semi-integration test; this also checks that wct-local (mostly) works.
        it('supports local browsers', function(done) {
          expectRun({}, ['--browsers', 'firefox', '-b', 'chrome'], function(call) {
            var names = _.map(call.args[0].options.activeBrowsers, function(browser) {
              return browser.browserName;
            });
            expect(names).to.have.members(['firefox', 'chrome']);
            done();
          });
        });

        // Semi-integration test; this also checks that wct-sauce (mostly) works.
        it('supports sauce browsers', function(done) {
          expectRun({}, ['--browsers', 'linux/firefox', '-b', 'linux/chrome'], function(call) {
            var names = _.map(call.args[0].options.activeBrowsers, function(browser) {
              return browser.browserName;
            });
            expect(names).to.have.members(['firefox', 'chrome']);
            done();
          });
        });

      });

      describe('--remote', function() {

        it('warns when used', function(done) {
          var log = expectRun({}, ['--remote'], function(call) {
            var hasWarning = _.any(log, function(l) { return /--remote.*--sauce/.test(l); });
            expect(hasWarning).to.eq(true, 'Expected a warning that --remote is deprecated');
            done();
          });
        });

        // Semi-integration test; this also checks that wct-sauce (mostly) works.
        it('sets up default sauce browsers', function(done) {
          expectRun({}, ['--remote'], function(call) {
            var platforms = call.args[0].options.activeBrowsers.map(function(browser) {
              return browser.platform;
            });
            expect(_.compact(platforms).length).to.be.gt(0);
            done();
          });
        });


      });

    });

  });

});
