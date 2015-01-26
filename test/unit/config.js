var chai      = require('chai');
var sinon     = require('sinon');
var sinonChai = require('sinon-chai');

var expect = chai.expect;
chai.use(sinonChai);

var config = require('../../runner/config');

describe('config', function() {

  var sandbox;
  beforeEach(function() {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('.merge', function() {

    it('avoids modifying the input', function() {
      var one    = {foo: 1};
      var two    = {foo: 2};
      var merged = config.merge(one, two);

      expect(one.foo).to.eq(1);
      expect(two.foo).to.eq(2);
      expect(merged.foo).to.eq(2);
      expect(merged).to.not.equal(two);
    });

    it('honors false as an explicit blacklisting', function() {
      var merged = config.merge(
        {plugins: {foo: {}}},
        {plugins: {foo: false}},
        {plugins: {foo: {}, bar: {}}}
      );

      expect(merged).to.deep.equal({plugins: {foo: false, bar: {}}});
    });

  });

});
