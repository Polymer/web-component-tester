import * as fs from 'fs-extra';
import * as path from 'path';
import * as rimraf from 'rimraf';

const rootDir = path.join(__dirname, '..', '..');
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
  if (fs.existsSync(tempDir)) {
    fs.removeSync(tempDir);
  }
  fs.mkdirSync(tempDir);
  const testDir = path.join(tempDir, dirname);
  fs.copySync(startingDir, testDir);
  fs.mkdirSync(path.join(testDir, 'node_modules'));
  fs.mkdirSync(path.join(testDir, 'node_modules', 'web-component-tester'));

  // set up symlinks into component dirs for browser.js, data/, and wct's
  // dependencies (like mocha, sinon, etc)
  const componentsDirs = new Set(['bower_components']);
  for (const baseFile of fs.readdirSync(startingDir)) {
    if (/^bower_components(-|$)/.test(baseFile)) {
      componentsDirs.add(baseFile);
    }
  }

  for (const baseComponentsDir of componentsDirs) {
    const componentsDir = path.join(testDir, baseComponentsDir);
    if (!fs.existsSync(componentsDir)) {
      fs.mkdirSync(componentsDir);
    }
    // all of wct's bower deps should be present in the project under tests'
    // components dir
    const bowerDeps =
        fs.readdirSync(path.join(__dirname, '../../bower_components'));
    for (const baseFile of bowerDeps) {
      fs.copySync(
          path.join(rootDir, 'bower_components', baseFile),
          path.join(componentsDir, baseFile), {recursive: true});
    }
    // Also set up a web-component-tester dir with symlinks into our own
    // client-side files.
    const wctDir = path.join(componentsDir, 'web-component-tester');
    fs.mkdirSync(wctDir);
    fs.copySync(
        path.join(rootDir, 'browser.js'), path.join(wctDir, 'browser.js'));
    fs.copySync(
        path.join(rootDir, 'package.json'), path.join(wctDir, 'package.json'));
    fs.copySync(
        path.join(rootDir, 'data'), path.join(wctDir, 'data'),
        {recursive: true});
  }

  return testDir;
}