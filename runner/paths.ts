/**
 * @license
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */
import * as _ from 'lodash';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import {Promise} from 'es6-promise';
import * as promisify from 'promisify-node';

/**
 * Expands a series of path patterns (globs, files, directories) into a set of
 * files that represent those patterns.
 *
 * @param {string} baseDir The directory that patterns are relative to.
 * @param {!Array<string>} patterns The patterns to expand.
 * @param {function(*, Array<string>)} done Callback given the expanded paths.
 */
export function expand(baseDir: string, patterns: string[], done: (err: any, value?: string[])=>void):void {
  unglob(baseDir, patterns).then((files) => {
    return expandDirectories(baseDir, files);
  }).then((results) => done(null, results), (err) => done(err));
}

/**
 * Expands any glob expressions in `patterns`.
 *
 * @param {string} baseDir
 * @param {!Array<string>} patterns
 */
 function unglob(baseDir: string, patterns: string[]): Promise<string[]> {
   const promises: Promise<string[]>[] = [];
   for (const pattern of patterns) {
     const f: any = promisify(glob);
     promises.push(f(String(pattern), {cwd: baseDir, root: baseDir}));
   }
   return Promise.all(promises).then((strs: string[][]) => {
     return _.union(_.flatten(strs));
   });
 }

/**
 * Expands any directories in `patterns`, following logic similar to a web
 * server.
 *
 * If a pattern resolves to a directory, that directory is expanded. If the
 * directory contains an `index.html`, it is expanded to that. Otheriwse, the
 * it expands into its children (recursively).
 *
 * @param {string} baseDir
 * @param {!Array<string>} patterns
 */
function expandDirectories(baseDir: string, paths: string[]): Promise<string[]> {
  const promises: Promise<string[]>[] = [];
  for (const aPath of paths) {
    promises.push(Promise.resolve().then(() => {
      return promisify(fs.stat)(path.resolve(baseDir, aPath));
    }).then((stat) => {
      if (!stat.isDirectory()) {
        return [aPath];
      }
      return promisify(fs.readdir)(path.resolve(baseDir, aPath)).then((files) => {
        // We have an index; defer to that.
        if (_.includes(files, 'index.html')) {
          return [path.join(aPath, 'index.html')];
        }
        return expandDirectories(path.join(baseDir, aPath), files).then((children) => {
          return children.map((child) => path.join(aPath, child));
        });
      });
    }));
  }

  return Promise.all(promises).then((listsOfPaths) => {
    const files = _.union(_.flatten(listsOfPaths));
    return files.filter((file) => /\.(js|html)$/.test(file));
  });
}
