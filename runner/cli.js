/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var chalk = require('chalk');

var config  = require('./config');
var Context = require('./context');
var test    = require('./test');

var PACKAGE_INFO   = require('../package.json');
var updateNotifier = require('update-notifier')({
  packageName:    PACKAGE_INFO.name,
  packageVersion: PACKAGE_INFO.version,
});

function run(env, args, output, callback) {
  var done = wrapCallback(output, callback);

  // Options parsing is a two phase affair. First, we need an initial set of
  // configuration so that we know which plugins to load, etc:
  var options = config.merge(config.fromDisk(), config.preparseArgs(args));
  // Depends on values from the initial merge:
  options = config.merge(options, {
    output:    output,
    ttyOutput: output.isTTY && !options.simpleOutput,
  });
  var context = new Context(options);

  // `parseArgs` merges any new configuration into `context.options`.
  config.parseArgs(context, args, function(error) {
    if (error) return done(error);
    test(context, done);
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
  run: run,
};
