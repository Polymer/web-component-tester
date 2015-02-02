var chai = require('chai');

var expect = chai.expect;

var config  = require('../../runner/config');
var Context = require('../../runner/context');

describe('config', function() {

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

  describe('.expand', function() {

    describe('deprecated options', function() {

      it('expands local string browsers', function(done) {
        var context = new Context({browsers: ['chrome']});
        config.expand(context, function(error) {
          expect(error).to.not.be.ok;
          expect(context.options.plugins.local.browsers).to.have.members(['chrome']);
          done();
        });
      });

      it('expands sauce string browsers', function(done) {
        var context = new Context({browsers: ['linux/firefox']});
        config.expand(context, function(error) {
          expect(error).to.not.be.ok;
          expect(context.options.plugins.sauce.browsers).to.have.members(['linux/firefox']);
          done();
        });
      });

      it('expands local object browsers', function(done) {
        var context = new Context({browsers: [{browserName: 'firefox'}]});
        config.expand(context, function(error) {
          expect(error).to.not.be.ok;
          expect(context.options.plugins.local.browsers).to.deep.have.members([{browserName: 'firefox'}]);
          done();
        });
      });

      it('expands sauce object browsers', function(done) {
        var context = new Context({browsers: [{browserName: 'safari', platform: 'OS X'}]});
        config.expand(context, function(error) {
          expect(error).to.not.be.ok;
          expect(context.options.plugins.sauce.browsers).to.deep.have.members([{browserName: 'safari', platform: 'OS X'}]);
          done();
        });
      });
    });

  });

});
