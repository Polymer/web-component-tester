/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var concat      = require('gulp-concat');
var david       = require('gulp-david');
var gulp        = require('gulp');
var gulpIf      = require('gulp-if');
var jshint      = require('gulp-jshint');
var lazypipe    = require('lazypipe');
var mocha       = require('gulp-mocha');
var notify      = require('gulp-notify');
var plumber     = require('gulp-plumber');
var runSequence = require('run-sequence');
var runTask     = require('orchestrator/lib/runTask');
var watch       = require('gulp-watch');
var wrap        = require('gulp-wrap');

var CSS_TO_JS =
    '(function() {\n' +
    'var style = document.createElement(\'style\');\n' +
    'style.textContent = \'<%= String(contents).replace(/\\n/g, "\\\\n").replace(/\'/g, "\\\\\'") %>\';\n' +
    'document.head.appendChild(style);\n' +
    '})();';

// Meta tasks

gulp.task('default', ['test']);

gulp.task('test', function(done) {
  runSequence('test:style', 'test:dependencies', 'test:unit', done);
});
gulp.task('test:all', function(done) {
  runSequence('test:style', 'test:dependencies', 'test:unit', 'test:integration', done);
});
gulp.task('build', ['build:browser', 'build:environment']);

gulp.task('watch', function() {
  var config = {
    emitOnGlob: false,
    gaze:       {debounceDelay: 10},
  };

  watch('browser/**/*', config, function(files, done) {
    runTask(gulp.tasks['build:browser'].fn.bind(gulp), done);
  });

  watch('environment/**/*', config, function(events, done) {
    runTask(gulp.tasks['build:environment'].fn.bind(gulp), done);
  });

  return watch('{runner,browser,environment}/**/*.js', config, function(files) {
    files
      .pipe(plumber({errorHandler: notify.onError('<%= error.message %>')}))
      .pipe(jshintFlow());
  });
});

// Specific tasks

gulp.task('build:browser', function() {
  return gulp.src([
      'vendor/mocha/mocha.js',
      'vendor/mocha/mocha.css',
      'vendor/stacky/lib/parsing.js',
      'vendor/stacky/lib/formatting.js',
      'vendor/stacky/lib/normalization.js',
      // Poor-man's dependency management, for now.
      'browser/index.js',
      'browser/util.js',
      'browser/**/*.{js,css}',
    ])
    .pipe(gulpIf(/\.css$/, wrap(CSS_TO_JS)))
    .pipe(concat('browser.js'))
    .pipe(gulp.dest('.'));
});

gulp.task('build:environment', function() {
  return gulp.src([
      'environment/license.js',
      'vendor/async/lib/async.js',
      'vendor/chai/chai.js',
      'vendor/lodash/lodash.js',
      'vendor/sinon/sinon.js',
      'vendor/sinon-chai/lib/sinon-chai.js',
      'environment/**/*.{js,css}',
    ])
    .pipe(gulpIf(/\.css$/, wrap(CSS_TO_JS)))
    .pipe(concat('environment.js'))
    .pipe(gulp.dest('.'));
});

gulp.task('test:style', function() {
  return gulp.src([
    '{browser,runner,environment,tasks}/**/*.js',
    'gulpfile.js',
  ]).pipe(jshintFlow());
});

gulp.task('test:dependencies', function() {
  return gulp.src('package.json')
    .pipe(david({error404: true}))
    .pipe(david.reporter)
    .on('data', function(file) {
      // TODO(nevir): Bring back
      // if (Object.keys(file.david.dependencies).length         > 0 ||
      //     Object.keys(file.david.optionalDependencies).length > 0 ||
      //     Object.keys(file.david.devDependencies).length      > 0) {
      //   var error = new Error('Dependencies are out of date');
      //   error.showStack = false;
      //   this.emit('error', error);
      // }
    });
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
