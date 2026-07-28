import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const generated = path.join(root, 'protocol/fixtures/generated');
const wasmDirectory = path.join(root, 'apps/web/public/wasm');
const paths = {
  proof: path.join(generated, 'fibonacci-10.proof.json'),
  statement: path.join(generated, 'fibonacci-10.statement.json'),
  fixture: path.join(generated, 'fibonacci-10.fixture.json'),
  generatedManifest: path.join(generated, 'manifest.json'),
  trustedPrograms: path.join(root, 'protocol/programs.json'),
  landingEvidence: path.join(
    root,
    'apps/web/src/features/landing/proofSpecimen.json',
  ),
  browserManifest: path.join(wasmDirectory, 'programs.json'),
  module: path.join(wasmDirectory, 'soul_wasm.js'),
  wasm: path.join(wasmDirectory, 'soul_wasm_bg.wasm'),
};
const missing = Object.entries(paths)
  .filter(([, file]) => !existsSync(file))
  .map(([name]) => name);

test('generated Fibonacci fixture verifies through the lazy-loaded browser WASM module', async () => {
    assert.deepEqual(
      missing,
      [],
      `generated integration assets are required: ${missing.join(', ')}`,
    );
    const fixture = JSON.parse(readFileSync(paths.fixture, 'utf8'));
    const generatedManifest = JSON.parse(readFileSync(paths.generatedManifest, 'utf8'));
    const trustedPrograms = JSON.parse(readFileSync(paths.trustedPrograms, 'utf8'));
    const landingEvidence = JSON.parse(readFileSync(paths.landingEvidence, 'utf8'));
    const browserManifest = JSON.parse(readFileSync(paths.browserManifest, 'utf8'));
    assert.deepEqual(browserManifest, trustedPrograms);
    const trustedProgram = browserManifest.programs['soul-cairo-v1'];
    assert.equal(fixture.program_hash, trustedProgram.program_hash);
    assert.equal(generatedManifest.program_hash, trustedProgram.program_hash);
    assert.equal(landingEvidence.program, 'soul-cairo-v1');
    assert.equal(landingEvidence.program_hash, trustedProgram.program_hash);
    assert.equal(landingEvidence.executable_sha256, trustedProgram.artifact_sha256);
    assert.equal(landingEvidence.proof_sha256, fixture.sha256);
    assert.equal(landingEvidence.proof_size, fixture.byte_size);

    const moduleUrl = `${pathToFileURL(paths.module).href}?integration=${Date.now()}`;
    const wasmModule = await import(moduleUrl);
    const wasmBytes = await readFile(paths.wasm);
    await wasmModule.default({ module_or_path: wasmBytes });

    const proofBytes = await readFile(paths.proof);
    assert.equal(proofBytes.byteLength, fixture.byte_size);
    assert.equal(createHash('sha256').update(proofBytes).digest('hex'), fixture.sha256);
    assert.equal(fixture.proof_file, 'fibonacci-10.proof.json');
    assert.equal(fixture.statement_file, 'fibonacci-10.statement.json');
    const statement = JSON.parse(readFileSync(paths.statement, 'utf8'));
    assert.equal(landingEvidence.statement.input, Number(BigInt(statement.public_input[0])));
    assert.equal(landingEvidence.statement.output, Number(BigInt(statement.public_output[0])));
    const verifier = new wasmModule.WasmVerifier();
    assert.equal(
      verifier.verifyProof(
        proofBytes,
        trustedProgram.program_hash,
        JSON.stringify(statement),
      ),
      true,
    );
});
