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
import * as grunt from 'grunt';
import * as _ from 'lodash';
import * as path from 'path';
import * as sinon from 'sinon';

import {Context} from '../../runner/context';
import * as steps from '../../runner/steps';


const wctLocalBrowsers = require('wct-local/lib/browsers');
const expect = chai.expect;
chai.use(require('sinon-chai'));

const LOCAL_BROWSERS = {
  aurora: {browserName: 'aurora', version: '1'},
  canary: {browserName: 'canary', version: '2'},
  chrome: {browserName: 'chrome', version: '3'},
  firefox: {browserName: 'firefox', version: '4'},
};

describe('grunt', function() {

  // Sinon doesn't stub process.env very well.
  let origEnv: any, origArgv: any;
  beforeEach(function() {
    origEnv = _.clone(process.env);
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

  async function runTask(task: string) {
    await new Promise((resolve, reject) => {
      grunt.task['options']({error: reject, done: resolve});
      grunt.task.run('wct-test:' + task)['start']();
    });
    // We shouldn't error before hitting it.
    expect(steps.runTests).to.have.been.calledOnce;
    return <{args: [Context]}>steps.runTests['getCall'](0);
  }

  describe('wct-test', function() {

    let sandbox: sinon.SinonSandbox;
    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      sandbox.stub(steps, 'prepare', async(_context: Context) => undefined);

      sandbox.stub(wctLocalBrowsers, 'detect', async() => LOCAL_BROWSERS);
      sandbox.stub(wctLocalBrowsers, 'supported', () => _.keys(LOCAL_BROWSERS));

      process.chdir(path.resolve(__dirname, '../fixtures/cli/standard'));
    });

    afterEach(function() {
      sandbox.restore();
    });

    describe('with a passing suite', function() {

      beforeEach(function() {
        sandbox.stub(steps, 'runTests', async() => undefined);
      });

      it('passes configuration through', async() => {
        const call = await runTask('passthrough');
        expect(call.args[0].options).to.include({foo: 1, bar: 'asdf'});
      });
    });

    describe('with a failing suite', function() {
      beforeEach(function() {
        sandbox.stub(steps, 'runTests', async() => {
          throw 'failures';
        });
      });

      it('passes errors out', async() => {
        try {
          await runTask('passthrough');
        } catch (error) {
          return;  // All's well!
        }
        throw new Error('Expected runTask to fail!');
      });
    });
  });
});
