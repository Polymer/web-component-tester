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

function init(gulp) {
  var options = config.fromEnv(process.env, process.argv, process.stdout);

  gulp.task('wct:sauce-tunnel', function(done) {
    var emitter = new events.EventEmitter();
    new CliReporter(emitter, options.output, options);
    steps.ensureSauceTunnel(options, emitter, function(error) {
      if (error) return cleanDone(done)(error);
      // Spin forever!
    });
  });

  gulp.task('test:local', function(done) {
    options.remote = false;
    test(options, cleanDone(done));
  });

  gulp.task('test:remote', function(done) {
    options.remote = true;
    test(options, cleanDone(done));
  });

  gulp.task('test', ['test:local']);
}

// Utility

function cleanDone(done) {
  return function(error) {
   if (error) {
      // Pretty error for gulp.
      error = new Error(chalk.red(error.message || error));
      error.showStack = false;
    }
    done(error);
  };
}

// Exports

module.exports = {
  init: init,
};
