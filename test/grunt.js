var chai  = require('chai');
var grunt = require('grunt');
var path  = require('path');
var sinon = require('sinon');

var steps = require('../runner/steps');

var expect = chai.expect;
chai.use(require('sinon-chai'));

describe('grunt' ,function() {

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
    grunt.loadTasks(path.resolve(__dirname, '..', 'tasks'));
  });

  describe('wct-test', function() {

    var sandbox;
    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      sandbox.stub(steps, 'runTests', function(options, emitter, done) { done(); });
    });

    afterEach(function() {
      sandbox.restore();
    });

    function runTask(task, done) {
      grunt.task.options({
        error: done,
        done: function(error) {
          expect(steps.runTests).to.have.been.calledOnce;
          done(null, steps.runTests.getCall(0));
        },
      });
      grunt.task.run('wct-test:' + task).start();
    }

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
      process.env.argv = ['grunt', 'wct-test:passthrough', '--persistent'];

      runTask('passthrough', function(error, call) {
        expect(error).to.not.be.ok;
        expect(call.args[0].sauce).to.include({username: '--fake-sauce--'});
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

});
