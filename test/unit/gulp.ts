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
import * as gulp from 'gulp';
import * as path from 'path';
import * as sinon from 'sinon';

import {Config} from '../../runner/config';
import {Context} from '../../runner/context';
import * as wctGulp from '../../runner/gulp';
import {Plugin} from '../../runner/plugin';
import * as steps from '../../runner/steps';

const expect = chai.expect;
chai.use(require('sinon-chai'));

const FIXTURES = path.resolve(__dirname, '../fixtures/cli');

describe('gulp', function() {

  let pluginsCalled: string[];
  let sandbox: sinon.SinonSandbox;
  let orch: gulp.Gulp;
  let options: Config;
  beforeEach(function() {
    orch = new gulp['Gulp']();
    wctGulp.init(orch);

    sandbox = sinon.sandbox.create();
    sandbox.stub(steps, 'prepare', async(_context: Context) => undefined);
    sandbox.stub(steps, 'runTests', async(context: Context) => {
      options = context.options;
    });

    pluginsCalled = [];
    sandbox.stub(Plugin.prototype, 'execute', async function(context: Context) {
      pluginsCalled.push(this.name);
      context.options.activeBrowsers.push(
          <any>{browserName: 'fake for ' + this.name});
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  async function runGulpTask(name: string) {
    await new Promise((resolve, reject) => {
      orch.start(name, (error) => error ? reject(error) : resolve());
    });
  }

  it('honors wcf.conf.js', async() => {
    process.chdir(path.join(FIXTURES, 'conf'));
    await runGulpTask('wct:sauce');
    expect(options.plugins['sauce'].username).to.eq('abc123');
  });

  it('prefers wcf.conf.json', async() => {
    process.chdir(path.join(FIXTURES, 'conf', 'json'));
    await runGulpTask('wct:sauce');
    expect(options.plugins['sauce'].username).to.eq('jsonconf');
  });

  describe('wct:local', function() {

    it('kicks off local tests', async() => {
      await runGulpTask('wct:local');
      expect(steps.runTests).to.have.been.calledOnce;
      expect(pluginsCalled).to.have.members(['local']);
    });

  });

  describe('wct:sauce', function() {

    it('kicks off sauce tests', async() => {
      await runGulpTask('wct:sauce');
      expect(steps.runTests).to.have.been.calledOnce;
      expect(pluginsCalled).to.have.members(['sauce']);
    });

  });

});
