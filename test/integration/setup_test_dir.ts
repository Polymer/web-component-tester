import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

const baseDir = path.join(__dirname, '..', 'fixtures', 'integration');
async function makeProperTestDir(dirname: string) {
  const startingDir = path.join(baseDir, dirname);
  const tempDir = path.join(baseDir, 'temp');
  if (await exists(tempDir)) {
    await new Promise((resolve, reject) => rimraf(tempDir, (err) =>
      err ? reject(err) : resolve()
    ));
  }
  fs.mkdirSync(tempDir);

  // copy dir

}

async function exists(fn: string) {
  return new Promise((resolve) => fs.stat(fn, (err) => resolve(!err)));
}
