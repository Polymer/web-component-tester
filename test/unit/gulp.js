var chai  = require('chai');
var gulp  = require('gulp');
var sinon = require('sinon');

var Plugin  = require('../../runner/plugin');
var steps   = require('../../runner/steps');
var wctGulp = require('../../runner/gulp');

var expect = chai.expect;
chai.use(require('sinon-chai'));

describe('gulp', function() {

  var pluginsCalled;
  var sandbox;
  var orch;
  beforeEach(function() {
    orch = new gulp.Gulp();
    wctGulp.init(orch);

    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare',  function(context, done) { done() });
    sandbox.stub(steps, 'runTests', function(context, done) { done() });

    pluginsCalled = [];
    sandbox.stub(Plugin.prototype, 'execute', function(context, done) {
      pluginsCalled.push(this.name);
      context.options.activeBrowsers.push({browserName: 'fake for ' + this.name});
      done()
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('wct:local', function() {

    it('kicks off local tests', function(done) {
      orch.start('wct:local', function(error) {
        expect(error).to.not.be.ok;
        expect(steps.runTests).to.have.been.calledOnce;
        expect(pluginsCalled).to.have.members(['local']);
        done();
      });
    });

  });

  describe('wct:sauce', function() {

    it('kicks off sauce tests', function(done) {
      orch.start('wct:sauce', function(error) {
        expect(error).to.not.be.ok;
        expect(steps.runTests).to.have.been.calledOnce;
        expect(pluginsCalled).to.have.members(['sauce']);
        done();
      });
    });

  });

});
