import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CAIRO_PROGRAM,
  ErrorCode,
  PROOF_CHANNEL,
  PROOF_FORMAT,
  PROOF_MEDIA_TYPE,
  SOUL_WIRE_PROTOCOL,
  SecretKeySigner,
  ServiceType,
  SoulNostrClient,
  assertStatementBoundToRequest,
  buildRequestContent,
  bytesToHex,
  fetchProofArtifact,
  feltFromNumber,
  getRequestKind,
  getResultKind,
  isSafeArtifactUrl,
  normalizeRelays,
  requestTags,
  serializeResult,
  serializeRequestContent,
  validateJobInput,
  validateRequestEvent,
} from '../dist/index.js';

test('canonical request content and tags round-trip through signature validation', async () => {
  const signer = new SecretKeySigner('01'.padStart(64, '0'));
  const content = buildRequestContent(
    { type: ServiceType.Fibonacci, n: 10 },
    1_060,
  );
  const event = await signer.signEvent({
    kind: getRequestKind(content.service),
    created_at: 1_000,
    tags: requestTags(content, 21),
    content: serializeRequestContent(content),
  });
  const request = validateRequestEvent(event, 1_001);

  assert.equal(request.content.protocol, SOUL_WIRE_PROTOCOL);
  assert.deepEqual(request.event.tags, [
    ['i', request.canonicalContent, 'text'],
    ['protocol', SOUL_WIRE_PROTOCOL],
    ['service', ServiceType.Fibonacci],
    ['t', 'soul-society'],
    ['expiration', '1060'],
    ['bid', '21'],
  ]);
  signer.destroy();
});

test('field and service bounds reject ambiguous inputs', () => {
  assert.throws(
    () => validateJobInput({ type: ServiceType.Fibonacci, n: 364 }),
    /0 through 363/,
  );
  assert.throws(
    () =>
      validateJobInput({
        type: ServiceType.MerkleProof,
        root: feltFromNumber(1),
        leaf: feltFromNumber(2),
        proof: [],
        index: 1,
      }),
    /does not fit/,
  );
});

test('statement binding omits request-only inputs but binds every declared public value', () => {
  const request = buildRequestContent({
    type: ServiceType.HashVerify,
    hash: feltFromNumber(42),
    preimage: feltFromNumber(7),
  });
  const statement = {
    service: ServiceType.HashVerify,
    program: CAIRO_PROGRAM,
    public_input: [feltFromNumber(42)],
    public_output: [feltFromNumber(1)],
    output: { type: ServiceType.HashVerify, valid: true },
  };
  assert.doesNotThrow(() => assertStatementBoundToRequest(statement, request));
  assert.throws(
    () =>
      assertStatementBoundToRequest(
        { ...statement, public_input: [feltFromNumber(7)] },
        request,
      ),
    /do not match/,
  );
});

test('stable wire constants remain explicit', () => {
  assert.equal(PROOF_FORMAT, 'stwo-cairo-json-v1');
  assert.equal(PROOF_MEDIA_TYPE, 'application/vnd.soul-society.stwo-proof+json');
  assert.equal(PROOF_CHANNEL, 'blake2s');
  assert.equal(ErrorCode.ArtifactUnavailable, 'artifact_unavailable');
});

test('proof URL policy is HTTPS-first and keeps loopback development explicit', () => {
  assert.equal(isSafeArtifactUrl('https://proofs.example/v1/proof.json'), true);
  assert.equal(isSafeArtifactUrl('http://127.0.0.1:8080/v1/proof.json'), true);
  assert.equal(isSafeArtifactUrl('http://localhost:8080/v1/proof.json'), true);
  assert.equal(isSafeArtifactUrl('http://proofs.example/v1/proof.json'), false);
  assert.equal(isSafeArtifactUrl('https://user:pass@proofs.example/proof.json'), false);
  assert.equal(isSafeArtifactUrl('https://proofs.example/proof.json#mutable'), false);
});

test('relay normalization is secure, deduplicated, and does not rewrite path queries', () => {
  assert.deepEqual(
    normalizeRelays([
      'ws://127.0.0.1:7000',
      'ws://127.0.0.1:7000/',
      'wss://relay.example/soul?channel=/',
    ]),
    ['ws://127.0.0.1:7000', 'wss://relay.example/soul?channel=/'],
  );
  assert.throws(
    () => normalizeRelays(['ws://relay.example']),
    /must use wss/,
  );
});

test('proof fetch streams the signed byte count and hashes before returning bytes', async () => {
  const proof = new TextEncoder().encode('{"proof":"real-shape-fixture"}');
  const sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', proof)));
  let requestOptions;
  const fetched = await fetchProofArtifact(
    {
      format: PROOF_FORMAT,
      media_type: PROOF_MEDIA_TYPE,
      url: 'https://proofs.example/v1/proof.json',
      sha256,
      byte_size: proof.byteLength,
      program_hash: feltFromNumber(9),
      channel: PROOF_CHANNEL,
    },
    {
      fetch: async (_url, options) => {
        requestOptions = options;
        return new Response(proof, {
          status: 200,
          headers: {
            'content-type': `${PROOF_MEDIA_TYPE}; charset=utf-8`,
            'content-length': String(proof.byteLength),
          },
        });
      },
    },
  );

  assert.deepEqual(fetched, proof);
  assert.equal(requestOptions.redirect, 'error');
  assert.equal(requestOptions.credentials, 'omit');
});

test('proof fetch rejects media confusion and a stream beyond the signed size', async () => {
  const descriptor = {
    format: PROOF_FORMAT,
    media_type: PROOF_MEDIA_TYPE,
    url: 'https://proofs.example/v1/proof.json',
    sha256: '0'.repeat(64),
    byte_size: 3,
    program_hash: feltFromNumber(9),
    channel: PROOF_CHANNEL,
  };
  await assert.rejects(
    fetchProofArtifact(descriptor, {
      fetch: async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    }),
    /must return application\/vnd\.soul-society\.stwo-proof\+json/,
  );
  await assert.rejects(
    fetchProofArtifact(descriptor, {
      fetch: async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': PROOF_MEDIA_TYPE },
        }),
    }),
    /exceeded its declared size/,
  );
});

test('client reaches verified only after an authentic result, digest fetch, and local verifier', async () => {
  const customer = new SecretKeySigner('02'.padStart(64, '0'));
  const provider = new SecretKeySigner('03'.padStart(64, '0'));
  const attacker = new SecretKeySigner('04'.padStart(64, '0'));
  const providerPubkey = await provider.getPublicKey();
  const proof = new TextEncoder().encode('{"proof":"integration-shape"}');
  const sha256 = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', proof)));
  const programHash = feltFromNumber(9);
  let published;
  let statementSeen;

  const transport = {
    async publish(_relays, event) {
      published = event;
    },
    subscribe(_relays, filter, onEvent) {
      assert.deepEqual(filter.authors, [providerPubkey]);
      let closed = false;
      queueMicrotask(async () => {
        const forgedFailure = {
          status: 'error',
          protocol: SOUL_WIRE_PROTOCOL,
          request_id: published.id,
          error: {
            code: ErrorCode.Internal,
            message: 'an authentic but unauthorized signer cannot settle the job',
          },
        };
        const attackerEvent = await attacker.signEvent({
          kind: getResultKind(ServiceType.Fibonacci),
          created_at: 1_001,
          tags: [
            ['request', JSON.stringify(published)],
            ['e', published.id],
            ['p', published.pubkey],
            ['i', published.content, 'text'],
            ['status', 'error'],
            ['protocol', SOUL_WIRE_PROTOCOL],
            ['service', ServiceType.Fibonacci],
            ['t', 'soul-society'],
          ],
          content: serializeResult(forgedFailure),
        });
        if (!closed) {
          onEvent(attackerEvent);
        }

        const result = {
          status: 'success',
          protocol: SOUL_WIRE_PROTOCOL,
          request_id: published.id,
          statement: {
            service: ServiceType.Fibonacci,
            program: CAIRO_PROGRAM,
            public_input: [feltFromNumber(10)],
            public_output: [feltFromNumber(55)],
            output: { type: ServiceType.Fibonacci, result: feltFromNumber(55) },
          },
          proof: {
            format: PROOF_FORMAT,
            media_type: PROOF_MEDIA_TYPE,
            url: 'https://proofs.example/v1/integration.json',
            sha256,
            byte_size: proof.byteLength,
            program_hash: programHash,
            channel: PROOF_CHANNEL,
          },
          metrics: {
            execution_ms: 1,
            proving_ms: 2,
            verification_ms: 3,
          },
        };
        const event = await provider.signEvent({
          kind: getResultKind(ServiceType.Fibonacci),
          created_at: 1_001,
          tags: [
            ['request', JSON.stringify(published)],
            ['e', published.id],
            ['p', published.pubkey],
            ['i', published.content, 'text'],
            ['status', 'success'],
            ['protocol', SOUL_WIRE_PROTOCOL],
            ['service', ServiceType.Fibonacci],
            ['t', 'soul-society'],
          ],
          content: serializeResult(result),
        });
        if (!closed) {
          onEvent(event);
        }
      });
      return () => {
        closed = true;
      };
    },
    close() {},
  };
  const client = new SoulNostrClient({
    signer: customer,
    verifier: {
      verifyProof(_proofBytes, _programHash, statementJson) {
        statementSeen = statementJson;
        return true;
      },
    },
    trustedProgramHash: programHash,
    trustedProviderPubkeys: [providerPubkey],
    relays: ['ws://127.0.0.1:7000'],
    transport,
    now: () => 1_000,
    fetch: async () =>
      new Response(proof, {
        status: 200,
        headers: {
          'content-type': PROOF_MEDIA_TYPE,
          'content-length': String(proof.byteLength),
        },
      }),
  });
  const job = client.createJob({ type: ServiceType.Fibonacci, n: 10 });
  const states = [];
  const unsubscribe = job.subscribe((snapshot) => states.push(snapshot.state));
  const verified = await job.start();

  assert.deepEqual(verified.result.content.statement.output, {
    type: ServiceType.Fibonacci,
    result: feltFromNumber(55),
  });
  assert.equal(JSON.parse(statementSeen).public_input[0], feltFromNumber(10));
  assert.deepEqual(states.filter((state, index) => index === 0 || state !== states[index - 1]), [
    'draft',
    'publishing',
    'awaiting_result',
    'result_received',
    'fetching',
    'verifying',
    'verified',
  ]);

  unsubscribe();
  client.close();
  customer.destroy();
  provider.destroy();
  attacker.destroy();
});
