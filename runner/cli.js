/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var chalk  = require('chalk');
var events = require('events');

var CliReporter = require('./clireporter');
var config      = require('./config');
var steps       = require('./steps');
var test        = require('./test');

var PACKAGE_INFO   = require('../package.json');
var updateNotifier = require('update-notifier')({
  packageName:    PACKAGE_INFO.name,
  packageVersion: PACKAGE_INFO.version,
});

function run(env, args, output, callback) {
  var done    = wrapCallback(output, callback);
  var options = config.fromEnv(env, args, output);

  if (options.extraArgs && options.extraArgs.length) {
    options.suites = options.extraArgs;
  }

  test(options, done);
}

function runSauceTunnel(env, args, output, callback) {
  var done = wrapCallback(output, callback);

  var options = config.fromEnv(env, args, output);
  var emitter = new events.EventEmitter();
  new CliReporter(emitter, output, options);

  steps.ensureSauceTunnel(options, emitter, function(error, tunnelId) {
    if (error) return done(error);
    output.write('\n');
    output.write('The tunnel will remain active while this process is running.\n');
    output.write('To use this tunnel for other WCT runs, export the following:\n');
    output.write('\n');
    output.write(chalk.cyan('export SAUCE_TUNNEL_ID=' + tunnelId) + '\n');
  });
}

function wrapCallback(output, done) {
  return function(error) {
    updateNotifier.notify({defer: false});

    if (error) {
      output.write('\n');
      output.write(chalk.red(error) + '\n');
      output.write('\n');
    }
    done(error);
  };
}

module.exports = {
  run:            run,
  runSauceTunnel: runSauceTunnel,
};
