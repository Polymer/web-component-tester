/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
'use strict';

const depcheck = require('depcheck');
const fs = require('fs');
const gulp = require('gulp');
const jshint = require('gulp-jshint');
const lazypipe = require('lazypipe');
const mocha = require('gulp-mocha');
const path = require('path');
const rollup = require('rollup');
const runSequence = require('run-sequence');
const ts = require('gulp-typescript');
const tslint = require('gulp-tslint');
const typings = require('gulp-typings');
const glob = require('glob');

const tsProject = ts.createProject('tsconfig.json', {
  typescript: require('typescript')
});

gulp.task('init', () => gulp.src('./typings.json').pipe(typings()));

gulp.task('lint', ['tslint', 'test:style', 'depcheck']);

// Meta tasks

gulp.task('default', ['test']);

function removeFile(path) {
  try {
    fs.unlinkSync(path);
    return;
  } catch(e) {
    try {
      fs.statSync(path);
    } catch(e) {
      return;
    }
    throw new Error('Unable to remove file: ' + path);
  }
}

gulp.task('clean', (done) => {
  removeFile('browser.js');
  removeFile('browser.js.map');
  glob('runner/*.js', (err, files) => {
    if (err) return done(err);
    try {
      for (const file of files) {
        removeFile(file);
      }
    } catch(e) {
      return done(e);
    }
    done();
  });
});

gulp.task('test', function(done) {
  runSequence(['build:typescript', 'lint'], 'test:unit', done);
});
gulp.task('test:all', function(done) {
  runSequence('test', 'test:integration', done);
});

gulp.task('build-all', (done) => {
  // This doesn't work, it stops right before it runs 'build'
  runSequence('clean', 'init', 'lint', 'build', done);
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
  gulp.src(['runner/*.ts', 'custom_typings/*.d.ts'])
    .pipe(tslint({
      configuration: 'tslint.json',
    }))
    .pipe(tslint.report('verbose')));

// Flows

const jshintFlow = lazypipe()
  .pipe(jshint)
  .pipe(jshint.reporter, 'jshint-stylish')
  .pipe(jshint.reporter, 'fail');

gulp.task('depcheck', () => {
  return new Promise((resolve, reject) => {
    depcheck(__dirname, {ignoreDirs: []}, resolve);
  }).then((result) => {
    const usedUnusually = new Set([
      // Used in browser.js
      'accessibility-developer-tools',
      'mocha',
      'test-fixture',

      // Used in the wct binary
      'resolve'
    ]);

    const invalidFiles = Object.keys(result.invalidFiles) || [];
    const invalidJsFiles = invalidFiles.filter((f) => f.endsWith('.js'));

    if (invalidJsFiles.length > 0) {
      console.log('Invalid files:', result.invalidFiles);
      throw new Error('Invalid files');
    }

    const unused = new Set(result.dependencies);
    for (const falseUnused of usedUnusually) {
      unused.delete(falseUnused);
    }
    if (unused.size > 0) {
      console.log('Unused dependencies:', unused);
      throw new Error('Unused dependencies');
    }
  });
});
