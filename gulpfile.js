/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var concat     = require('gulp-concat');
var gulp       = require('gulp');
var gulpIf     = require('gulp-if');
var lazypipe   = require('lazypipe');
var sourcemaps = require('gulp-sourcemaps');
var watch      = require('gulp-watch')
var wrap       = require('gulp-wrap');

var CSS_TO_JS =
    "(function() {\n" +
    "var style = document.createElement('style');\n" +
    "style.textContent = '<%= contents.replace(/'/g, \"\\\\'\").replace(/\\n/g, '\\\\n') %>';\n" +
    "document.head.appendChild(style);\n" +
    "})();";

gulp.task('build:browser', function() {
  return gulp.src([
      'vendor/mocha/mocha.js',
      'vendor/mocha/mocha.css',
      'vendor/chai/chai.js',
      'vendor/async/lib/async.js',
      'vendor/WebConsole-reporter/WebConsole.js',
      'vendor/stacky/lib/parsing.js',
      'vendor/stacky/lib/formatting.js',
      'vendor/stacky/lib/normalization.js',
      // Poor-man's dependency management, for now.
      'browser/index.js',
      'browser/util.js',
      'browser/**/*.{js,css}',
    ])
    .pipe(sourcemaps.init())
    .pipe(gulpIf(/\.css$/, wrap(CSS_TO_JS)))
    .pipe(concat('browser.js'))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('.'));
});

gulp.task('watch', function() {
  watch('browser/**/*', function() {
    gulp.start('build:browser');
  });
});
