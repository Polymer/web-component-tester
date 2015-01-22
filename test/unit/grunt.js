var _     = require('lodash');
var chai  = require('chai');
var grunt = require('grunt');
var path  = require('path');
var sinon = require('sinon');

var steps = require('../../runner/steps');

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
        sandbox.stub(steps, 'prepare',  function(context, done) { done(); });
        sandbox.stub(steps, 'runTests', function(context, done) { done(); });

        process.chdir(path.resolve(__dirname, '../fixtures/integration/standard'));
      });

      afterEach(function() {
        sandbox.restore();
      });

      it('passes configuration through', function(done) {
        runTask('passthrough', function(error, call) {
          expect(error).to.not.be.ok;
          expect(call.args[0].options).to.include({foo: 1, bar: 'asdf'});
          done();
        });
      });

    });

    describe('with a failing suite', function() {

      var sandbox;
      beforeEach(function() {
        sandbox = sinon.sandbox.create();
        sandbox.stub(steps, 'prepare',  function(context, done) { done(); });
        sandbox.stub(steps, 'runTests', function(context, done) { done('failures'); });

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
