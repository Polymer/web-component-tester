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

const concat = require('gulp-concat');
const depcheck = require('depcheck');
const fs = require('fs');
const glob = require('glob');
const gulp = require('gulp');
const bower = require('gulp-bower');
const mocha = require('gulp-spawn-mocha');
const tslint = require('gulp-tslint');
const ts = require('gulp-typescript');
const lazypipe = require('lazypipe');
const path = require('path');
const rollup = require('rollup');
const runSequence = require('run-sequence');
const typescript = require('typescript');


// const commonTools = require('tools-common/gulpfile');
const commonTools = {
  depcheck: commonDepCheck
};

gulp.task('lint', ['tslint', 'depcheck']);

// Meta tasks

gulp.task('default', ['test']);

function removeFile(path) {
  try {
    fs.unlinkSync(path);
    return;
  } catch (e) {
    try {
      fs.statSync(path);
    } catch (e) {
      return;
    }
    throw new Error('Unable to remove file: ' + path);
  }
}

gulp.task('clean', (done) => {
  removeFile('browser.js');
  removeFile('browser.js.map');
  const patterns = ['runner/*.js', 'browser/**/*.js', 'browser/**/*.js.map'];
  for (const pattern of patterns) {
    glob(pattern, (err, files) => {
      if (err) {
        return done(err);
      }
      try {
        for (const file of files) {
          removeFile(file);
        }
      } catch (e) {
        return done(e);
      }
    });
  }
  done();
});

gulp.task('test', function (done) {
  runSequence(
    'build:typescript-server',
    'lint',
    'test:unit',
    'test:integration',
    done);
});

gulp.task('build-all', (done) => {
  runSequence('clean', 'lint', 'build', done);
});

gulp.task('build',
  ['build:typescript-server', 'build:browser', 'build:wct-browser-legacy']);

const tsProject = ts.createProject('tsconfig.json', { typescript });
gulp.task('build:typescript-server', function () {
  // Ignore typescript errors, because gulp-typescript, like most things
  // gulp, can't be trusted.
  return tsProject.src().pipe(tsProject(ts.reporter.nullReporter())).js.pipe(gulp.dest('./'));
});

const browserTsProject = ts.createProject('browser/tsconfig.json', {
  typescript
});
gulp.task('build:typescript-browser', function () {
  return browserTsProject.src().pipe(
    browserTsProject(ts.reporter.nullReporter())).js.pipe(gulp.dest('./browser/'));
});

// Specific tasks

gulp.task('build:browser', ['build:typescript-browser'], function (done) {
  rollup.rollup({
    entry: 'browser/index.js',
  }).then(function (bundle) {
    bundle.write({
      indent: false,
      format: 'iife',
      banner: fs.readFileSync('browser-js-header.txt', 'utf-8'),
      intro: 'window.__wctUseNpm = false;',
      dest: 'browser.js',
      sourceMap: true,
      sourceMapFile: path.resolve('browser.js.map')
    }).then(function () {
      done();
    });
  }).catch(done);
});

gulp.task('build:wct-browser-legacy:a11ySuite', function () {
  return gulp.src(['data/a11ySuite-npm-header.txt', 'data/a11ySuite.js'])
    .pipe(concat('a11ySuite.js'))
    .pipe(gulp.dest('wct-browser-legacy/'));
});

gulp.task('build:wct-browser-legacy:browser', ['build:typescript-browser'], function (done) {
  rollup.rollup({
    entry: 'browser/index.js',
  }).then(function (bundle) {
    bundle.write({
      indent: false,
      format: 'iife',
      banner: fs.readFileSync('browser-js-header.txt', 'utf-8'),
      intro: 'window.__wctUseNpm = true;',
      dest: 'wct-browser-legacy/browser.js',
      sourceMap: true,
      sourceMapFile: path.resolve('browser.js.map')
    }).then(function () {
      done();
    });
  }).catch(done);
});

gulp.task('build:wct-browser-legacy', [
  'build:wct-browser-legacy:a11ySuite',
  'build:wct-browser-legacy:browser',
]);


gulp.task('test:unit', function () {
  return gulp.src('test/unit/*.js', { read: false })
    .pipe(mocha({ reporter: 'spec' }));
});

gulp.task('bower', function () {
  return bower();
});

gulp.task('test:integration', ['bower'], function () {
  return gulp.src('test/integration/*.js', { read: false })
    .pipe(mocha({ reporter: 'spec' }));
});

gulp.task('tslint', () =>
  gulp.src([
    'runner/**/*.ts', '!runner/**/*.d.ts',
    'test/**/*.ts', '!test/**/*.d.ts',
    'custom_typings/*.d.ts', 'browser/**/*.ts', '!browser/**/*.ts'
  ])
    .pipe(tslint())
    .pipe(tslint.report({ formatter: 'verbose' })));

// Flows

commonTools.depcheck({
  stickyDeps: new Set([
    // Used in browser.js
    'accessibility-developer-tools',
    'mocha',
    'test-fixture',
    '@polymer/sinonjs',
    '@polymer/test-fixture',
    '@webcomponents/webcomponentsjs',
    'async',

    // Only included to satisfy peer dependency and suppress error on install
    'sinon',

    // Used in the wct binary
    'resolve'
  ])
});

function commonDepCheck(options) {
  const defaultOptions = { stickyDeps: new Set() };
  options = Object.assign({}, defaultOptions, options);

  gulp.task('depcheck', () => {
    return new Promise((resolve, reject) => {
      depcheck(
        __dirname, { ignoreDirs: [], ignoreMatches: ['@types/*'] }, resolve);
    }).then((result) => {
      const invalidFiles = Object.keys(result.invalidFiles) || [];
      const invalidJsFiles = invalidFiles.filter((f) => f.endsWith('.js'));

      if (invalidJsFiles.length > 0) {
        console.log('Invalid files:', result.invalidFiles);
        throw new Error('Invalid files');
      }

      const unused = new Set(result.dependencies);
      for (const falseUnused of options.stickyDeps) {
        unused.delete(falseUnused);
      }
      if (unused.size > 0) {
        console.log('Unused dependencies:', unused);
        throw new Error('Unused dependencies');
      }
    });
  });
}

gulp.task('prepublish', function (done) {
  // We can't run the integration tests here because on travis we may not
  // be running with an x instance when we do `npm install`. We can change
  // this to just `test` from `test:unit` once all supported npm versions
  // no longer run `prepublish` on install.
  runSequence('build-all', 'test:unit', done);
});
