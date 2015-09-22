/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var esperanto   = require('esperanto');
var fs          = require('fs');
var gulp        = require('gulp');
var jshint      = require('gulp-jshint');
var lazypipe    = require('lazypipe');
var mocha       = require('gulp-mocha');
var runSequence = require('run-sequence');

// Meta tasks

gulp.task('default', ['test']);

gulp.task('test', function(done) {
  runSequence('test:style', 'test:unit', done);
});
gulp.task('test:all', function(done) {
  runSequence('test', 'test:integration', done);
});
gulp.task('build', ['build:browser']);

// Specific tasks

gulp.task('build:browser', function(done) {
  esperanto.bundle({
    base:  'browser',
    entry: 'index.js',
  }).then(function(bundle) {
    var result = bundle.concat({
      strict:        true,
      sourceMap:     true,
      sourceMapFile: 'browser.js',
    });

    var sourceMap = result.map.toString()
        // Just use relative paths.
        .replace(new RegExp('../' + __dirname + '/', 'g'), '');

    fs.writeFileSync('browser.js',     result.code);
    fs.writeFileSync('browser.js.map', sourceMap);
    done();
  }).catch(done);
});

gulp.task('test:style', function() {
  return gulp.src([
    '{browser,runner,environment,tasks}/**/*.js',
    'gulpfile.js',
  ]).pipe(jshintFlow());
});

gulp.task('test:unit', function() {
  return gulp.src('test/unit/*.js', {read: false})
      .pipe(mocha({reporter: 'spec'}));
});

gulp.task('test:integration', function() {
  return gulp.src('test/integration/*.js', {read: false})
      .pipe(mocha({reporter: 'spec'}));
});

// Flows

var jshintFlow = lazypipe()
  .pipe(jshint)
  .pipe(jshint.reporter, 'jshint-stylish')
  .pipe(jshint.reporter, 'fail');
