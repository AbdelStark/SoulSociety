#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [sourcePath, executablePath, destinationPath] = process.argv.slice(2);

if (!sourcePath || !executablePath || !destinationPath) {
  console.error(
    'usage: write-program-manifest.mjs <fixture-manifest> <cairo-executable> <destination>',
  );
  process.exit(2);
}

const source = JSON.parse(await readFile(resolve(sourcePath), 'utf8'));
const canonicalFelt = /^0x[0-9a-f]{64}$/;

if (
  source.protocol !== 'soul-society/1' ||
  source.program !== 'soul-cairo-v1' ||
  !canonicalFelt.test(source.program_hash)
) {
  throw new Error('fixture manifest does not describe the expected Soul Cairo program');
}

const executable = await readFile(resolve(executablePath));
const artifactSha256 = createHash('sha256').update(executable).digest('hex');
const manifest = {
  schema_version: 1,
  protocol: source.protocol,
  programs: {
    [source.program]: {
      program_hash: source.program_hash,
      artifact_sha256: artifactSha256,
      artifact: 'crates/soul-cairo/target/dev/soul_cairo.executable.json',
      cairo: '2.15.0',
      scarb: '2.15.1',
      stwo_cairo: '1.3.0',
      proof_format: 'stwo-cairo-json-v1',
      channel: 'blake2s',
    },
  },
};

await writeFile(resolve(destinationPath), `${JSON.stringify(manifest, null, 2)}\n`);
