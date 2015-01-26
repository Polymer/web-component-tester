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
      var stub = sandbox.stub(Plugin, 'get', function(name, callback) {
        callback(null, name);
      });

      context.plugins(function(error, plugins) {
        expect(error).to.not.be.ok;
        expect(stub).to.have.been.calledOnce;
        expect(stub).to.have.been.calledWith('sauce', sinon.match.func);
        expect(plugins).to.have.members(['sauce']);

        done();
      });
    });

  });

});
