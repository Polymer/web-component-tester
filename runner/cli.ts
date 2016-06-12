/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

import * as chalk from 'chalk';
import * as events from 'events';
import * as _ from 'lodash';

import {CliReporter} from './clireporter';
import * as config from './config';
import {Context} from './context';
import {Plugin} from './plugin';
import {test} from './test';

const PACKAGE_INFO   = require('../package.json');
const noopNotifier = {notify: () => {}};
let updateNotifier = noopNotifier;

(function() {
  try {
    updateNotifier = require('update-notifier')({
      pkg: PACKAGE_INFO
    });
  } catch (error) {
    // S'ok if we don't have update-notifier. It's optional.
  }
})();

export function run(
      env: any, args: string[], output: NodeJS.WritableStream,
      callback: (err: any) => void) {
  const done = wrapCallback(output, callback);

  // Options parsing is a two phase affair. First, we need an initial set of
  // configuration so that we know which plugins to load, etc:
  let options = <config.Config>config.preparseArgs(args);
  // Depends on values from the initial merge:
  options = config.merge(options, <config.Config> {
    output:    output,
    ttyOutput: !process.env.CI && output['isTTY'] && !options.simpleOutput,
  });
  const context = new Context(options);

  if (options.skipUpdateCheck) {
    updateNotifier = noopNotifier;
  }

  // `parseArgs` merges any new configuration into `context.options`.
  config.parseArgs(context, args, function(error) {
    if (error) return done(error);
    test(context, done);
  });
}

// Note that we're cheating horribly here. Ideally all of this logic is within
// wct-sauce. The trouble is that we also want WCT's configuration lookup logic,
// and that's not (yet) cleanly exposed.
export function runSauceTunnel(
      env: void, args: string[], output: NodeJS.WritableStream,
      callback: (err: any) => void) {
  const done = wrapCallback(output, callback);

  const diskOptions = config.fromDisk();
  const baseOptions: config.Config =
      (diskOptions.plugins && diskOptions.plugins['sauce'])
      || diskOptions.sauce
      || {};

  Plugin.get('sauce',  (error, plugin) => {
    if (error) return done(error);

    const parser = require('nomnom');
    parser.script('wct-st');
    parser.options(_.omit(plugin.cliConfig, 'browsers', 'tunnelId'));
    const options = _.merge(baseOptions, parser.parse(args));

    const wctSauce = require('wct-sauce');
    wctSauce.expandOptions(options);

    const emitter = new events.EventEmitter();
    new CliReporter(emitter, output, <config.Config>{});
    wctSauce.startTunnel(options, emitter, (error: any, tunnelId: string) => {
      if (error) return done(error); // Otherwise, we keep at it.
      output.write('\n');
      output.write(
          'The tunnel will remain active while this process is running.\n');
      output.write(
          'To use this tunnel for other WCT runs, export the following:\n');
      output.write('\n');
      output.write(chalk.cyan('export SAUCE_TUNNEL_ID=' + tunnelId) + '\n');
    });
  });
}

function wrapCallback(output: NodeJS.WritableStream, done: (err: any) => void) {
  return (error: any) => {
    if (!process.env.CI) {
      updateNotifier.notify();
    }

    if (error) {
      output.write('\n');
      output.write(chalk.red(error) + '\n');
      output.write('\n');
    }
    done(error);
  };
}
