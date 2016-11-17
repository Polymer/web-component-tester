/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
import {expect} from 'chai';
import * as path from 'path';

import * as paths from '../../runner/paths';

describe('paths', function() {

  describe('.expand', function() {
    const baseDir = path.resolve(__dirname, '../fixtures/paths');

    async function expectExpands(patterns: string[], expected: string[]) {
      const actual = await paths.expand(baseDir, patterns);

      // for non-POSIX support
      expected = expected.map((str) => str.replace(/\//g, path.sep));
      expect(actual).to.have.members(expected);
    }

    it('is ok with an empty list', async() => {
      await expectExpands([], []);
    });

    it('ignores explicit files that are missing', async() => {
      await expectExpands(['404.js'], []);
      await expectExpands(['404.js', 'foo.html'], ['foo.html']);
    });

    it('does not expand explicit files', async() => {
      await expectExpands(['foo.js'], ['foo.js']);
      await expectExpands(['foo.html'], ['foo.html']);
      await expectExpands(['foo.js', 'foo.html'], ['foo.js', 'foo.html']);
    });

    it('expands directories into their files', async() => {
      await expectExpands(['foo'], ['foo/one.js', 'foo/two.html']);
      await expectExpands(['foo/'], ['foo/one.js', 'foo/two.html']);
    });

    it('expands directories into index.html when present', async() => {
      await expectExpands(['bar'], ['bar/index.html']);
      await expectExpands(['bar/'], ['bar/index.html']);
    });

    it('expands directories recursively, honoring all rules', async() => {
      await expectExpands(['baz'], [
        'baz/a/fizz.html',
        'baz/b/index.html',
        'baz/a.html',
        'baz/b.js',
      ]);
    });

    it('accepts globs for explicit file matches', async() => {
      await expectExpands(['baz/*.js'], ['baz/b.js']);
      await expectExpands(['baz/*.html'], ['baz/a.html']);
      await expectExpands(['baz/**/*.js'], [
        'baz/b/deep/stuff.js',
        'baz/b/one.js',
        'baz/b.js',
      ]);
      await expectExpands(['baz/**/*.html'], [
        'baz/a/fizz.html',
        'baz/b/deep/index.html',
        'baz/b/deep/stuff.html',
        'baz/b/index.html',
        'baz/a.html',
      ]);
    });

    it('accepts globs for directories, honoring directory behavior',
       async() => {
         await expectExpands(['*'], [
           'bar/index.html',
           'baz/a/fizz.html',
           'baz/b/index.html',
           'baz/a.html',
           'baz/b.js',
           'foo/one.js',
           'foo/two.html',
           'foo.html',
           'foo.js',
         ]);
         await expectExpands(['baz/*'], [
           'baz/a/fizz.html',
           'baz/b/index.html',
           'baz/a.html',
           'baz/b.js',
         ]);
       });

    it('deduplicates', async() => {
      await expectExpands(['bar/a.js', 'bar/*.js', 'bar', 'bar/*.html'], [
        'bar/a.js',
        'bar/index.html',
        'bar/index.js',
      ]);
    });
  });
});
