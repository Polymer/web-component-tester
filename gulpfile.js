/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var david       = require('gulp-david');
var esperanto   = require('esperanto');
var fs          = require('fs');
var gulp        = require('gulp');
var jshint      = require('gulp-jshint');
var lazypipe    = require('lazypipe');
var mocha       = require('gulp-mocha');
var notify      = require('gulp-notify');
var plumber     = require('gulp-plumber');
var runSequence = require('run-sequence');
var runTask     = require('orchestrator/lib/runTask');
var watch       = require('gulp-watch');

// Meta tasks

gulp.task('default', ['test']);

gulp.task('test', function(done) {
  runSequence('test:style', 'test:dependencies', 'test:unit', done);
});
gulp.task('test:all', function(done) {
  runSequence('test:style', 'test:dependencies', 'test:unit', 'test:integration', done);
});
gulp.task('build', ['build:browser']);

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
