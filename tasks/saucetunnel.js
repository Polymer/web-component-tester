/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var _      = require('lodash');
var chalk  = require('chalk');
var events = require('events');

var CleanKill   = require('../runner/cleankill');
var CliReporter = require('../runner/clireporter');
var config      = require('../runner/config');
var steps       = require('../runner/steps');

module.exports = function(grunt) {
  grunt.registerMultiTask('wct-sauce-tunnel', 'Spins up a persistent Sauce Labs tunnel', function() {
    var options = config.mergeDefaults(this.options(config.fromEnv(process.env, process.argv)));
    var emitter = new events.EventEmitter();
    new CliReporter(emitter, options.output, options);

    var done = this.async();
    steps.ensureSauceTunnel(options, emitter, function(error) {
      // Only stop on error.
      if (error) {
        console.log(chalk.red(error));
        CleanKill.close(done.bind(null, false));
      }
    });
  });
};
