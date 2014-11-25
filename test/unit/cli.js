var async  = require('async');
var expect = require('chai').expect;
var sinon  = require('sinon');
var path   = require('path');

var browsers = require('../../runner/browsers');
var cli      = require('../../runner/cli');
var steps    = require('../../runner/steps');

var FIXTURES = path.resolve(__dirname, '../fixtures/integration');

describe('cli', function() {

  var sandbox;
  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'runTests', function(options, emitter, done) { done(); });
    sandbox.stub(browsers, 'expand', function(browsers, remote, callback) {
      callback(null, [{browserName: 'test', version: '1.2'}]);
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
    }

    it('expands test/ by default, and serves from the parent', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, [], function(call) {
        expect(call.args[0].suites).to.have.members([
          'standard/test/a.html',
          'standard/test/b.js',
        ]);
        expect(call.args[0].root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors globs', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, ['**/*.html'], function(call) {
        expect(call.args[0].suites).to.have.members([
          'standard/test/a.html',
          'standard/x-foo.html',
        ]);
        expect(call.args[0].root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors expanded files', function(done) {
      process.chdir(path.join(FIXTURES, 'standard'));

      expectRun({}, ['test/b.js', 'x-foo.html'], function(call) {
        expect(call.args[0].suites).to.have.members([
          'standard/test/b.js',
          'standard/x-foo.html',
        ]);
        expect(call.args[0].root).to.equal(FIXTURES);
        done();
      });
    });

    it('honors --root with no specified suites', function(done) {
      process.chdir(__dirname);

      var root = path.join(FIXTURES, 'standard');
      expectRun({}, ['--root', root], function(call) {
        expect(call.args[0].suites).to.have.members([
          'test/a.html',
          'test/b.js',
        ]);
        expect(call.args[0].root).to.equal(root);
        done();
      });
    });

    it('honors --root with specified suites', function(done) {
      process.chdir(__dirname);

      var root = path.join(FIXTURES, 'standard');
      expectRun({}, ['--root', root, '**/*.html'], function(call) {
        expect(call.args[0].suites).to.have.members([
          'test/a.html',
          'x-foo.html',
        ]);
        expect(call.args[0].root).to.equal(root);
        done();
      });
    });

    it('throws an error if no suites could be found', function(done) {
      cli.run({}, ['404'], {write: function() {}}, function(error) {
        expect(error).to.match(/no.*suites.*found/i);
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
          expect(call.args[0].suites).to.have.members([
            'conf/test/foo.js',
          ]);
          expect(call.args[0].root).to.equal(FIXTURES);
          done();
        });
      });

      it('walks the ancestry', function(done) {
        process.chdir(path.join(ROOT, 'branch/leaf'));

        expectRun({}, [], function(call) {
          expect(call.args[0].suites).to.have.members([
            'conf/test/foo.js',
          ]);
          expect(call.args[0].root).to.equal(FIXTURES);
          done();
        });
      });

      it('honors specified values', function(done) {
        process.chdir(ROOT);

        expectRun({}, [], function(call) {
          expect(call.args[0].sauce.username).to.eq('abc123');
          done();
        });
      });

      it('honors root', function(done) {
        process.chdir(path.join(ROOT, 'rooted'));

        expectRun({}, [], function(call) {
          expect(call.args[0].suites).to.have.members([
            'integration/conf/test/foo.js',
          ]);
          expect(call.args[0].root).to.equal(path.dirname(FIXTURES));
          done();
        });
      });

    });

  });

});
