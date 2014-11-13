var async  = require('async');
var expect = require('chai').expect;
var path   = require('path');

var paths = require('../../runner/paths');

describe('paths', function() {

  describe('.expand', function() {
    var baseDir = path.resolve(__dirname, '../fixtures/paths');

    function expectExpands(patterns, expected, done) {
      paths.expand(baseDir, patterns, function(error, actual) {
        expect(error).to.not.be.ok;
        expect(actual).to.have.members(expected);
        done();
      });
    }

    it('is ok with an empty list', function(done) {
      expectExpands([], [], done);
    });

    it('ignores explicit files that are missing', function(done) {
      async.series([
        expectExpands.bind(null, ['404.js'], []),
        expectExpands.bind(null, ['404.js', 'foo.html'], ['foo.html']),
      ], done);
    });

    it('does not expand explicit files', function(done) {
      async.series([
        expectExpands.bind(null, ['foo.js'], ['foo.js']),
        expectExpands.bind(null, ['foo.html'], ['foo.html']),
        expectExpands.bind(null, ['foo.js', 'foo.html'], ['foo.js', 'foo.html']),
      ], done);
    });

    it('expands directories into their files', function(done) {
      async.series([
        expectExpands.bind(null, ['foo'],  ['foo/one.js', 'foo/two.html']),
        expectExpands.bind(null, ['foo/'], ['foo/one.js', 'foo/two.html']),
      ], done);
    });

    it('expands directories into index.html when present', function(done) {
      async.series([
        expectExpands.bind(null, ['bar'],  ['bar/index.html']),
        expectExpands.bind(null, ['bar/'], ['bar/index.html']),
      ], done);
    });

    it('expands directories recursively, honoring all rules', function(done) {
      expectExpands(['baz'], [
        'baz/a/fizz.html',
        'baz/b/index.html',
        'baz/a.html',
        'baz/b.js',
      ], done);
    });

    it('accepts globs for explicit file matches', function(done) {
      async.series([
        expectExpands.bind(null, ['baz/*.js'],   ['baz/b.js']),
        expectExpands.bind(null, ['baz/*.html'], ['baz/a.html']),
        expectExpands.bind(null, ['baz/**/*.js'], [
          'baz/b/deep/stuff.js',
          'baz/b/one.js',
          'baz/b.js',
        ]),
        expectExpands.bind(null, ['baz/**/*.html'], [
          'baz/a/fizz.html',
          'baz/b/deep/index.html',
          'baz/b/deep/stuff.html',
          'baz/b/index.html',
          'baz/a.html',
        ]),
      ], done);
    });

    it('accepts globs for directories, honoring directory behavior', function(done) {
      async.series([
        expectExpands.bind(null, ['*'], [
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
        expectExpands.bind(null, ['baz/*'], [
          'baz/a/fizz.html',
          'baz/b/index.html',
          'baz/a.html',
          'baz/b.js',
        ]),
      ], done);
    });

    it('deduplicates', function(done) {
      expectExpands(['bar/a.js', 'bar/*.js', 'bar', 'bar/*.html'], [
        'bar/a.js',
        'bar/index.html',
        'bar/index.js',
      ], done);
    });

  });

});
