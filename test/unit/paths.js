/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
var expect = require('chai').expect;
var path   = require('path');

var paths = require('../../runner/paths');

describe('paths', function() {

  describe('.expand', function() {
    var baseDir = path.resolve(__dirname, '../fixtures/paths');

    function expectExpands(patterns, expected) {
      return paths.expand(baseDir, patterns).then((actual) => {
        expect(actual).to.have.members(expected);
      });
    }

    it('is ok with an empty list', function() {
      return expectExpands([], []);
    });

    it('ignores explicit files that are missing', function() {
      return Promise.all([
        expectExpands(['404.js'], []),
        expectExpands(['404.js', 'foo.html'], ['foo.html']),
      ]);
    });

    it('does not expand explicit files', function() {
      return Promise.all([
        expectExpands(['foo.js'], ['foo.js']),
        expectExpands(['foo.html'], ['foo.html']),
        expectExpands(['foo.js', 'foo.html'], ['foo.js', 'foo.html']),
      ]);
    });

    it('expands directories into their files', function() {
      return Promise.all([
        expectExpands(['foo'],  ['foo/one.js', 'foo/two.html']),
        expectExpands(['foo/'], ['foo/one.js', 'foo/two.html']),
      ]);
    });

    it('expands directories into index.html when present', function() {
      return Promise.all([
        expectExpands(['bar'],  ['bar/index.html']),
        expectExpands(['bar/'], ['bar/index.html']),
      ]);
    });

    it('expands directories recursively, honoring all rules', function() {
      expectExpands(['baz'], [
        'baz/a/fizz.html',
        'baz/b/index.html',
        'baz/a.html',
        'baz/b.js',
      ]);
    });

    it('accepts globs for explicit file matches', function() {
      return Promise.all([
        expectExpands(['baz/*.js'],   ['baz/b.js']),
        expectExpands(['baz/*.html'], ['baz/a.html']),
        expectExpands(['baz/**/*.js'], [
          'baz/b/deep/stuff.js',
          'baz/b/one.js',
          'baz/b.js',
        ]),
        expectExpands(['baz/**/*.html'], [
          'baz/a/fizz.html',
          'baz/b/deep/index.html',
          'baz/b/deep/stuff.html',
          'baz/b/index.html',
          'baz/a.html',
        ]),
      ]);
    });

    it('accepts globs for directories, honoring directory behavior', function() {
      return Promise.all([
        expectExpands(['*'], [
          'bar/index.html',
          'baz/a/fizz.html',
          'baz/b/index.html',
          'baz/a.html',
          'baz/b.js',
          'foo/one.js',
          'foo/two.html',
          'foo.html',
          'foo.js',
        ]),
        expectExpands(['baz/*'], [
          'baz/a/fizz.html',
          'baz/b/index.html',
          'baz/a.html',
          'baz/b.js',
        ]),
      ]);
    });

    it('deduplicates', function() {
      return expectExpands(['bar/a.js', 'bar/*.js', 'bar', 'bar/*.html'], [
        'bar/a.js',
        'bar/index.html',
        'bar/index.js',
      ]);
    });

  });

});
