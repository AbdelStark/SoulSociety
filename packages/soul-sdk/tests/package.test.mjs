import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const packageRoot = path.resolve(import.meta.dirname, '..');

test('npm tarball is self-contained and publishes built entrypoints only', () => {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: packageRoot,
      encoding: 'utf8',
    },
  );
  const [pack] = JSON.parse(output);
  const files = new Set(pack.files.map((file) => file.path));

  for (const required of [
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'package.json',
    'dist/index.js',
    'dist/index.d.ts',
  ]) {
    assert.equal(files.has(required), true, `tarball is missing ${required}`);
  }
  assert.equal(
    [...files].some((file) => file.startsWith('src/')),
    false,
    'TypeScript sources should not leak into the release tarball',
  );
  assert.equal(
    [...files].some((file) => file.endsWith('.map')),
    false,
    'The release tarball should not contain maps that reference unpublished sources',
  );
});
