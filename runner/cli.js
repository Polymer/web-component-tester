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
var findup = require('findup');
var path   = require('path');
var yargs  = require('yargs');

var config = require('./config');
var test   = require('./test');

function run(env, args, output, callback) {
  var done = wrapCallback(output, callback);

  var options = config.fromEnv(env, args);
  options.output = output;

  if (options.extraArgs[0]) {
    return runTests(options.extraArgs[0], options, done);
  }

  findup(process.cwd(), 'test', function(error, dir) {
    if (error) return done(error);
    runTests(dir, options, done);
  });
}

function wrapCallback(output, done) {
  return function(error) {
    if (error) {
      output.write('\n');
      output.write(chalk.red(error) + '\n');
      output.write('\n');
    }
    done(error);
  };
}

function runTests(workingDir, options, done) {
  var root = path.resolve(workingDir);
  try {
    process.chdir(root);
  } catch (error) {
    return done('Unable to run tests within "' + root + '": ' + error);
  }

  test(options, done);
}

module.exports = {
  run: run,
};
