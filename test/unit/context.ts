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
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

import {Context} from '../../runner/context';
import {Plugin} from '../../runner/plugin';

const expect = chai.expect;
chai.use(sinonChai);

describe('Context', () => {

  let sandbox: sinon.SinonSandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('.plugins', () => {

    it('excludes plugins with a falsy config', async() => {
      const context = new Context(<any>{plugins: {local: false, sauce: {}}});
      const stub = sandbox.stub(Plugin, 'get', (name: string) => {
        return Promise.resolve(name);
      });

      const plugins = await context.plugins();
      expect(stub).to.have.been.calledOnce;
      expect(stub).to.have.been.calledWith('sauce');
      expect(plugins).to.have.members(['sauce']);
    });

    it('excludes plugins disabled: true', async() => {
      const context =
          new Context(<any>{plugins: {local: {}, sauce: {disabled: true}}});
      const stub = sandbox.stub(Plugin, 'get', (name: string) => {
        return Promise.resolve(name);
      });

      const plugins = await context.plugins();
      expect(stub).to.have.been.calledOnce;
      expect(stub).to.have.been.calledWith('local');
      expect(plugins).to.have.members(['local']);
    });

    describe('hook handlers with non-callback second argument', async() => {
      it('are passed the "done" callback function instead of the argument passed to emitHook', async() => {
        const context = new Context();
        context.hook('foo', function(arg1: any, done: () => void) {
          expect(arg1).to.eq('hookArg');
          done();
        });
        await context.emitHook('foo', 'hookArg');
      });
    });

    describe('hook handlers written to call callbacks', () => {
      it('passes additional arguments through', async() => {
        const context = new Context();
        context.hook(
            'foo',
            (arg1: string, arg2: number, hookDone: (err?: any) => void) => {
              expect(arg1).to.eq('one');
              expect(arg2).to.eq(2);
              hookDone();
            });

        // Tests the promise form of emitHook.
        await context.emitHook('foo', 'one', 2);

        // Tests the callback form of emitHook.
        const error = await new Promise((resolve) => {
          context.emitHook('foo', 'one', 2, resolve);
        });
        expect(error).to.not.be.ok;
      });

      it('halts on error', async() => {
        const context = new Context();
        context.hook('bar', function(hookDone: (err?: any) => void) {
          hookDone('nope');
        });

        // Tests the promise form of emitHook.
        try {
          await context.emitHook('bar');
          throw new Error('emitHook should have thrown');
        } catch (error) {
          expect(error).to.eq('nope');
        }

        // Tests the callback form of emitHook.
        const error = await new Promise((resolve) => {
          context.emitHook('bar', resolve);
        });
        expect(error).to.eq('nope');
      });
    });

    describe('hooks handlers written to return promises', () => {
      it('passes additional arguments through', async() => {
        const context = new Context();
        context.hook('foo', async function(arg1: any, arg2: any) {
          expect(arg1).to.eq('one');
          expect(arg2).to.eq(2);
        });

        await context.emitHook('foo', 'one', 2);
        const error = await new Promise((resolve) => {
          context.emitHook('foo', 'one', 2, resolve);
        });
        expect(error).to.not.be.ok;
      });

      it('halts on error', async() => {
        const context = new Context();
        context.hook('bar', async() => {
          throw 'nope';
        });

        // Tests the promise form of emitHook.
        try {
          await context.emitHook('bar');
          throw new Error('emitHook should have thrown');
        } catch (error) {
          expect(error).to.eq('nope');
        }

        // Tests the callback form of emitHook.
        const error = await new Promise((resolve) => {
          context.emitHook('bar', resolve);
        });
        expect(error).to.eq('nope');
      });
    });
  });
});
