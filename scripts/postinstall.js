/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var bower  = require('bower');
var path   = require('path');

process.chdir(path.dirname(__dirname));
console.log('Fetching bower dependencies for the WCT client to', path.join(process.cwd(), 'bower_components'));
bower.commands.install(null, [], {}, {})
    .on('end', function(installed) {
      console.log('Fetched bower packages:', Object.keys(installed).join(', '));
    })
    .on('error', function(error) {
      console.log('Failed to fetch bower dependencies:', error.stack);
      console.log('');
      console.log('WCT install will continue, but you may need to manually provide browser dependencies (mocha, chai, etc)');
    });
