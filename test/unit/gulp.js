/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var chai  = require('chai');
var gulp  = require('gulp');
var path  = require('path');
var sinon = require('sinon');

var Plugin  = require('../../runner/plugin');
var steps   = require('../../runner/steps');
var wctGulp = require('../../runner/gulp');

var expect = chai.expect;
chai.use(require('sinon-chai'));

var FIXTURES = path.resolve(__dirname, '../fixtures/integration');

describe('gulp', function() {

  var pluginsCalled;
  var sandbox;
  var orch;
  var options;
  beforeEach(function() {
    orch = new gulp.Gulp();
    wctGulp.init(orch);

    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare',  function(context, done) { done() });
    sandbox.stub(steps, 'runTests', function(context, done) {
      options = context.options;
      done();
    });

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

  it('honors wcf.conf.js', function(done) {
    process.chdir(path.join(FIXTURES, 'conf'));
    orch.start('wct:sauce', function(error) {
      expect(error).to.not.be.ok;
      expect(options.plugins.sauce.username).to.eq('abc123');
      done();
    });
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
