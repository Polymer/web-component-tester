import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

const baseDir = path.join(__dirname, '..', 'fixtures', 'integration');

/**
 * Sets up the given integration fixture with proper bower components.
 *
 * For wct to work it needs to be installed in the bower_components directory
 * (or, with variants, in each variant directory). So this copies the given
 * integration test fixture, then sets up symlinks from
 * bower_components/web-component-tester/browser.js to the browser.js of this
 * repo. It also makes symlinks for each of wct's bower dependencies into the
 * integration tests' bower_components dir.
 *
 * @param dirname The basename of an integration fixture directory.
 * @return A fully resolved path to a copy of the fixture directory with
 *   a proper bower_components directory.
 */
export async function makeProperTestDir(dirname: string) {
  const startingDir = path.join(baseDir, dirname);
  const tempDir = path.join(baseDir, 'temp');
  if (await exists(tempDir)) {
    await new Promise((resolve, reject) => {
      rimraf(tempDir, (err) => err ? reject(err) : resolve());
    });
  }
  fs.mkdirSync(tempDir);

  // copy dir
  const pathToTestDir = await copyDir(startingDir, tempDir);

  fs.mkdirSync(path.join(pathToTestDir, 'node_modules'));
  fs.mkdirSync(
      path.join(pathToTestDir, 'node_modules', 'web-component-tester'));

  // set up symlinks into component dirs for browser.js, data/, and wct's
  // dependencies (like mocha, sinon, etc)
  const componentsDirs = new Set(['bower_components']);
  for (const baseFile of fs.readdirSync(startingDir)) {
    if (/^bower_components(-|$)/.test(baseFile)) {
      componentsDirs.add(baseFile);
    }
  }

  for (const baseComponentsDir of componentsDirs) {
    const componentsDir = path.join(pathToTestDir, baseComponentsDir);
    if (!await exists(componentsDir)) {
      fs.mkdirSync(componentsDir);
    }
    // all of wct's bower deps should be present in the project under tests'
    // components dir
    const bowerDeps =
        fs.readdirSync(path.join(__dirname, '../../bower_components'));
    for (const baseFile of bowerDeps) {
      fs.symlinkSync(
          path.join('../../../../../../bower_components', baseFile),
          path.join(componentsDir, baseFile));
    }
    // Also set up a web-component-tester dir with symlinks into our own
    // client-side files.
    const wctDir = path.join(componentsDir, 'web-component-tester');
    fs.mkdirSync(wctDir);
    fs.symlinkSync(
        '../../../../../../../browser.js', path.join(wctDir, 'browser.js'),
        'file');
    fs.symlinkSync(
        '../../../../../../../package.json', path.join(wctDir, 'package.json'),
        'file');
    fs.symlinkSync(
        '../../../../../../../data', path.join(wctDir, 'data'), 'dir');
  }

  return pathToTestDir;
}

async function copyDir(from: string, to: string) {
  const newDir = path.join(to, path.basename(from));
  fs.mkdirSync(newDir);
  for (const baseFile of fs.readdirSync(from)) {
    const file = path.join(from, baseFile);
    if (fs.statSync(file).isDirectory()) {
      await copyDir(file, newDir);
    } else {
      const newFile = path.join(newDir, baseFile);
      fs.writeFileSync(newFile, fs.readFileSync(file));
    }
  }
  return newDir;
}

async function exists(fn: string) {
  return new Promise((resolve) => fs.stat(fn, (err) => resolve(!err)));
}
