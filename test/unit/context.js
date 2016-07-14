/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var chai      = require('chai');
var sinon     = require('sinon');
var sinonChai = require('sinon-chai');

var expect = chai.expect;
chai.use(sinonChai);

var Context = require('../../runner/context');
var Plugin  = require('../../runner/plugin');

describe('Context', function() {

  var sandbox;
  beforeEach(function() {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('.plugins', function() {

    it('excludes plugins with a falsy config', function(done) {
      var context = new Context({plugins: {local: false, sauce: {}}});
      var stub = sandbox.stub(Plugin, 'get', (name) => {
        return Promise.resolve(name)
      });

      context.plugins(function(error, plugins) {
        expect(error).to.not.be.ok;
        expect(stub).to.have.been.calledOnce;
        expect(stub).to.have.been.calledWith('sauce');
        expect(plugins).to.have.members(['sauce']);
        done();
      });
    });

    it('excludes plugins disabled: true', function(done) {
      var context = new Context({plugins: {local: {}, sauce: {disabled: true}}});
      var stub = sandbox.stub(Plugin, 'get', (name) => {
        return Promise.resolve(name)
      });

      context.plugins(function(error, plugins) {
        expect(error).to.not.be.ok;
        expect(stub).to.have.been.calledOnce;
        expect(stub).to.have.been.calledWith('local');
        expect(plugins).to.have.members(['local']);
        done();
      });
    });

    it('passes additional arguments through', function(done) {
      var context = new Context();
      context.hook('foo', function(arg1, arg2, hookDone) {
        expect(arg1).to.eq('one');
        expect(arg2).to.eq(2);
        hookDone();
      });

      context.emitHook('foo', 'one', 2, function(error) {
        expect(error).to.not.be.ok;
        done();
      });
    });

    it('halts on error', function(done) {
      var context = new Context();
      context.hook('bar', function(hookDone) {
        hookDone('nope');
      });

      context.emitHook('bar',function(error) {
        expect(error).to.eq('nope');
        done();
      });
    });

  });

});
