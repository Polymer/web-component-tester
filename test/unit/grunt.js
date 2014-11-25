var _     = require('lodash');
var chai  = require('chai');
var grunt = require('grunt');
var path  = require('path');
var sinon = require('sinon');

var browsers = require('../../runner/browsers');
var steps    = require('../../runner/steps');

var expect = chai.expect;
chai.use(require('sinon-chai'));

describe('grunt' ,function() {

  // Sinon doesn't stub process.env very well.
  var origEnv, origArgv;
  beforeEach(function() {
    origEnv  = _.clone(process.env);
    origArgv = process.argv;
  });
  afterEach(function() {
    _.assign(process.env, origEnv);
    _.difference(_.keys(process.env), _.keys(origEnv)).forEach(function(key) {
      delete process.env[key];
    });
    process.argv = origArgv;
  });

  before(function() {
    grunt.initConfig({
      'wct-test': {
        'passthrough': {
          options: {foo: 1, bar: 'asdf'},
        },
        'override': {
          options: {sauce: {username: '--real-sauce--'}},
        },
      },
    });
    grunt.loadTasks(path.resolve(__dirname, '../../tasks'));
  });

  function runTask(task, done) {
    var called = false;
    function handleCallback(error) {
      if (called) return;
      called = true;
      // We shouldn't error before hitting it.
      expect(steps.runTests).to.have.been.calledOnce;
      done(error, steps.runTests.getCall(0));
    }

    grunt.task.options({error: handleCallback, done: handleCallback});
    grunt.task.run('wct-test:' + task).start();
  }

  describe('wct-test', function() {

    describe('with a passing suite', function() {

      var sandbox;
      beforeEach(function() {
        sandbox = sinon.sandbox.create();
        sandbox.stub(steps, 'runTests', function(options, emitter, done) { done(); });
        sandbox.stub(browsers, 'expand', function(browsers, remote, callback) {
          callback(null, [{browserName: 'test', version: '1.2'}]);
        });

        process.chdir(path.resolve(__dirname, '../fixtures/integration/standard'));
      });

      afterEach(function() {
        sandbox.restore();
      });

      it('passes configuration through', function(done) {
        runTask('passthrough', function(error, call) {
          expect(error).to.not.be.ok;
          expect(call.args[0]).to.include({foo: 1, bar: 'asdf'});
          done();
        });
      });

      it('picks up ENV-based configuration', function(done) {
        process.env.SAUCE_USERNAME = '--fake-sauce--';

        runTask('passthrough', function(error, call) {
          expect(error).to.not.be.ok;
          expect(call.args[0].sauce).to.include({username: '--fake-sauce--'});
          done();
        });
      });

      it('picks up CLI flags', function(done) {
        process.argv = ['grunt', 'wct-test:passthrough', '--persistent'];

        runTask('passthrough', function(error, call) {
          expect(error).to.not.be.ok;
          expect(call.args[0]).to.include({persistent: true});
          done();
        });
      });

      it('prefers direct configuration over ENV', function(done) {
        process.env.SAUCE_USERNAME = '--fake-sauce--';

        runTask('override', function(error, call) {
          expect(error).to.not.be.ok;
          expect(call.args[0].sauce).to.include({username: '--real-sauce--'});
          done();
        });
      });

    });

    describe('with a failing suite', function() {

      var sandbox;
      beforeEach(function() {
        sandbox = sinon.sandbox.create();
        sandbox.stub(steps, 'runTests', function(options, emitter, done) { done('failures'); });
        sandbox.stub(browsers, 'expand', function(browsers, remote, callback) {
          callback(null, [{browserName: 'test', version: '1.2'}]);
        });

        process.chdir(path.resolve(__dirname, '../fixtures/integration/standard'));
      });

      afterEach(function() {
        sandbox.restore();
      });

      it('passes errors out', function(done) {
        runTask('passthrough', function(error, call) {
          expect(error).to.be.ok;
          done();
        });
      });

    });

  });

});
