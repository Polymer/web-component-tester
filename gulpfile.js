/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
const fs = require('fs');
const gulp = require('gulp');
const jshint = require('gulp-jshint');
const path = require('path');
const lazypipe = require('lazypipe');
const mocha = require('gulp-mocha');
const rollup = require('rollup');
const runSequence = require('run-sequence');
const ts = require('gulp-typescript');
const tslint = require("gulp-tslint");

const tsProject = ts.createProject('tsconfig.json', {
  typescript: require('typescript')
});

// Meta tasks

gulp.task('default', ['test']);

gulp.task('test', function(done) {
  runSequence(['build:typescript', 'test:style'], 'test:unit', done);
});
gulp.task('test:all', function(done) {
  runSequence('test', 'test:integration', done);
});
gulp.task('build', ['build:typescript', 'build:browser']);

gulp.task('build:typescript', function() {
  return tsProject.src().pipe(ts(tsProject)).js.pipe(gulp.dest('./'));
});

// Specific tasks

gulp.task('build:browser', function(done) {
  rollup.rollup({
    entry: 'browser/index.js',
  }).then(function(bundle) {
    bundle.write({
      indent: false,
      format: 'iife',
      banner: fs.readFileSync('license-header.txt', 'utf-8'),
      dest: 'browser.js',
      sourceMap: true,
      sourceMapFile: path.resolve('browser.js.map')
    }).then(function() {
      done();
    });
  }).catch(done);
});

gulp.task('test:style', function() {
  return gulp.src([
    '{browser,runner,environment,tasks}/**/*.js',
    'gulpfile.js',
    '!runner/*.js',
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

gulp.task('tslint', () =>
  gulp.src('runner/*.ts')
    .pipe(tslint({
      configuration: 'tslint.json',
    }))
    .pipe(tslint.report('verbose')));

// Flows

const jshintFlow = lazypipe()
  .pipe(jshint)
  .pipe(jshint.reporter, 'jshint-stylish')
  .pipe(jshint.reporter, 'fail');
