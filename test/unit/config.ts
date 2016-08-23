/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
import * as chai from 'chai';

import * as config from '../../runner/config';
import {Context} from '../../runner/context';
const expect = chai.expect;

describe('config', function() {

  describe('.merge', function() {

    it('avoids modifying the input', function() {
      const one = <any>{foo: 1};
      const two = <any>{foo: 2};
      const merged = <any>config.merge(one, two);

      expect(one.foo).to.eq(1);
      expect(two.foo).to.eq(2);
      expect(merged.foo).to.eq(2);
      expect(merged).to.not.equal(two);
    });

    it('honors false as an explicit blacklisting', function() {
      const merged = config.merge(
          <any>{plugins: {foo: {}}}, <any>{plugins: {foo: false}},
          <any>{plugins: {foo: {}, bar: {}}});

      expect(merged).to.deep.equal({plugins: {foo: false, bar: {}}});
    });

  });

  describe('.expand', function() {

    describe('deprecated options', function() {

      it('expands local string browsers', function() {
        const context = new Context(<any>{browsers: ['chrome']});
        return config.expand(context).then(() => {
          expect(context.options.plugins['local'].browsers).to.have.members([
            'chrome'
          ]);
        });
      });

      it('expands sauce string browsers', function() {
        const context = new Context(<any>{browsers: ['linux/firefox']});
        return config.expand(context).then(() => {
          expect(context.options.plugins['sauce'].browsers).to.have.members([
            'linux/firefox'
          ]);
        });
      });

      it('expands local object browsers', function() {
        const context =
            new Context(<any>{browsers: [{browserName: 'firefox'}]});
        return config.expand(context).then(() => {
          expect(context.options.plugins['local'].browsers)
              .to.deep['have']
              .members([{browserName: 'firefox'}]);
        });
      });

      it('expands sauce object browsers', function() {
        const context = new Context(
            <any>{browsers: [{browserName: 'safari', platform: 'OS X'}]});
        return config.expand(context).then(() => {
          expect(context.options.plugins['sauce'].browsers)
              .to.deep['have']
              .members([{browserName: 'safari', platform: 'OS X'}]);
        });
      });
    });

  });

});
