import { verifyEvent, type Event } from 'nostr-tools';

import {
  CAIRO_PROGRAM,
  LIMITS,
  PROOF_CHANNEL,
  PROOF_FORMAT,
  PROOF_MEDIA_TYPE,
  SOUL_TOPIC,
  SOUL_WIRE_PROTOCOL,
  getRequestKind,
  getResultKind,
  serviceFromKind,
} from './constants.js';
import {
  buildRequestContent,
  serializeRequestContent,
  serializeResult,
} from './canonical.js';
import {
  ErrorCode,
  ServiceType,
  type FieldElement,
  type FailedJobResult,
  type JobInput,
  type JobMetrics,
  type JobOutput,
  type JobRequestContent,
  type JobResult,
  type ProofDescriptor,
  type ProofStatement,
  type SuccessfulJobResult,
  type ValidatedRequest,
  type ValidatedResult,
} from './types.js';
import {
  feltFromNumber,
  hasExactKeys,
  isFieldElement,
  isHex64,
  isPlainRecord,
  isSafeArtifactUrl,
  utf8ByteLength,
} from './utils.js';

const SERVICE_VALUES = new Set<string>(Object.values(ServiceType));
const ERROR_CODES = new Set<string>(Object.values(ErrorCode));
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

export class WireValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireValidationError';
  }
}

function invalid(message: string): never {
  throw new WireValidationError(message);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}

function parseService(value: unknown): ServiceType {
  if (typeof value !== 'string' || !SERVICE_VALUES.has(value)) {
    return invalid('The service identifier is not supported by Soul Wire v1.');
  }
  return value as ServiceType;
}

export function validateJobInput(value: unknown): JobInput {
  if (!isPlainRecord(value) || typeof value.type !== 'string') {
    return invalid('A typed Soul Wire input object is required.');
  }

  switch (value.type) {
    case ServiceType.Fibonacci: {
      if (!hasExactKeys(value, ['type', 'n'])) {
        return invalid('A Fibonacci input must contain only type and n.');
      }
      if (!isNonNegativeSafeInteger(value.n) || value.n > LIMITS.MAX_FIBONACCI_N) {
        return invalid(`Fibonacci n must be an integer from 0 through ${LIMITS.MAX_FIBONACCI_N}.`);
      }
      return { type: ServiceType.Fibonacci, n: value.n };
    }
    case ServiceType.HashVerify: {
      if (!hasExactKeys(value, ['type', 'hash', 'preimage'])) {
        return invalid('A hash input must contain only type, hash, and preimage.');
      }
      if (!isFieldElement(value.hash) || !isFieldElement(value.preimage)) {
        return invalid('Hash inputs must be canonical Cairo field elements.');
      }
      return {
        type: ServiceType.HashVerify,
        hash: value.hash,
        preimage: value.preimage,
      };
    }
    case ServiceType.MerkleProof: {
      if (!hasExactKeys(value, ['type', 'root', 'leaf', 'proof', 'index'])) {
        return invalid('A Merkle input must contain only type, root, leaf, proof, and index.');
      }
      if (!isFieldElement(value.root) || !isFieldElement(value.leaf)) {
        return invalid('Merkle roots and leaves must be canonical Cairo field elements.');
      }
      if (
        !Array.isArray(value.proof) ||
        value.proof.length > LIMITS.MAX_MERKLE_DEPTH ||
        !value.proof.every(isFieldElement)
      ) {
        return invalid(`A Merkle path may contain at most ${LIMITS.MAX_MERKLE_DEPTH} field elements.`);
      }
      if (!isNonNegativeSafeInteger(value.index)) {
        return invalid('A Merkle index must be a non-negative safe integer.');
      }
      const indexLimit = value.proof.length === 0 ? 1 : 2 ** value.proof.length;
      if (value.index >= indexLimit) {
        return invalid('The Merkle index does not fit the supplied authentication path.');
      }
      return {
        type: ServiceType.MerkleProof,
        root: value.root,
        leaf: value.leaf,
        proof: [...value.proof],
        index: value.index,
      };
    }
    default:
      return invalid('The input type is not supported by Soul Wire v1.');
  }
}

function parseOutput(value: unknown): JobOutput {
  if (!isPlainRecord(value) || typeof value.type !== 'string') {
    return invalid('The result output is not a typed object.');
  }

  switch (value.type) {
    case ServiceType.Fibonacci:
      if (!hasExactKeys(value, ['type', 'result']) || !isFieldElement(value.result)) {
        return invalid('The Fibonacci output is malformed.');
      }
      return { type: ServiceType.Fibonacci, result: value.result };
    case ServiceType.HashVerify:
      if (!hasExactKeys(value, ['type', 'valid']) || typeof value.valid !== 'boolean') {
        return invalid('The hash verification output is malformed.');
      }
      return { type: ServiceType.HashVerify, valid: value.valid };
    case ServiceType.MerkleProof:
      if (!hasExactKeys(value, ['type', 'valid']) || typeof value.valid !== 'boolean') {
        return invalid('The Merkle verification output is malformed.');
      }
      return { type: ServiceType.MerkleProof, valid: value.valid };
    default:
      return invalid('The result output type is unsupported.');
  }
}

function parseRequestContent(value: unknown, createdAt: number, now: number): JobRequestContent {
  if (
    !isPlainRecord(value) ||
    (!hasExactKeys(value, ['protocol', 'service', 'input']) &&
      !hasExactKeys(value, ['protocol', 'service', 'input', 'expires_at']))
  ) {
    return invalid('The request content has an invalid shape.');
  }
  if (value.protocol !== SOUL_WIRE_PROTOCOL) {
    return invalid('The request uses an unsupported Soul Wire protocol.');
  }

  const input = validateJobInput(value.input);
  const service = parseService(value.service);
  if (service !== input.type) {
    return invalid('The declared service does not match the typed request input.');
  }

  let expiresAt: number | undefined;
  if ('expires_at' in value) {
    if (!isNonNegativeSafeInteger(value.expires_at)) {
      return invalid('The request expiry is invalid.');
    }
    expiresAt = value.expires_at;
    if (
      expiresAt <= now ||
      expiresAt < createdAt ||
      expiresAt - createdAt > LIMITS.MAX_REQUEST_TTL_SECS
    ) {
      return invalid('The request is expired or exceeds the maximum one-hour lifetime.');
    }
  }
  return buildRequestContent(input, expiresAt);
}

function parseStatement(value: unknown): ProofStatement {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['service', 'program', 'public_input', 'public_output', 'output'])
  ) {
    return invalid('The proof statement has an invalid shape.');
  }
  const service = parseService(value.service);
  if (value.program !== CAIRO_PROGRAM) {
    return invalid('The proof statement names an untrusted program identifier.');
  }
  if (
    !Array.isArray(value.public_input) ||
    value.public_input.length > LIMITS.MAX_MERKLE_DEPTH + 4 ||
    !value.public_input.every(isFieldElement) ||
    !Array.isArray(value.public_output) ||
    value.public_output.length > LIMITS.MAX_MERKLE_DEPTH + 8 ||
    !value.public_output.every(isFieldElement)
  ) {
    return invalid('The proof statement contains invalid public field elements.');
  }
  const output = parseOutput(value.output);
  if (output.type !== service) {
    return invalid('The proof output service does not match the statement.');
  }
  const publicInput = value.public_input as FieldElement[];
  const publicOutput = value.public_output as FieldElement[];
  const typedLayoutMatches = (() => {
    switch (output.type) {
      case ServiceType.Fibonacci:
        return (
          publicInput.length === 1 &&
          publicOutput.length === 1 &&
          publicOutput[0] === output.result
        );
      case ServiceType.HashVerify:
        return (
          publicInput.length === 1 &&
          publicOutput.length === 1 &&
          publicOutput[0] === feltFromNumber(output.valid ? 1 : 0)
        );
      case ServiceType.MerkleProof:
        return (
          publicInput.length === 3 &&
          publicOutput.length === 1 &&
          publicOutput[0] === feltFromNumber(output.valid ? 1 : 0)
        );
    }
  })();
  if (!typedLayoutMatches) {
    return invalid('The typed output does not match the Cairo public output layout.');
  }
  return {
    service,
    program: CAIRO_PROGRAM,
    public_input: [...publicInput],
    public_output: [...publicOutput],
    output,
  };
}

function parseProofDescriptor(value: unknown): ProofDescriptor {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      'format',
      'media_type',
      'url',
      'sha256',
      'byte_size',
      'program_hash',
      'channel',
    ])
  ) {
    return invalid('The proof descriptor has an invalid shape.');
  }
  if (
    value.format !== PROOF_FORMAT ||
    value.media_type !== PROOF_MEDIA_TYPE ||
    value.channel !== PROOF_CHANNEL ||
    !isHex64(value.sha256) ||
    !isFieldElement(value.program_hash) ||
    !isNonNegativeSafeInteger(value.byte_size) ||
    value.byte_size === 0 ||
    value.byte_size > LIMITS.MAX_PROOF_BYTES ||
    typeof value.url !== 'string'
  ) {
    return invalid('The proof descriptor metadata is invalid.');
  }

  if (!isSafeArtifactUrl(value.url)) {
    return invalid(
      'The proof artifact must use HTTPS without credentials or fragments; HTTP is loopback-only.',
    );
  }
  return {
    format: PROOF_FORMAT,
    media_type: PROOF_MEDIA_TYPE,
    url: value.url,
    sha256: value.sha256,
    byte_size: value.byte_size,
    program_hash: value.program_hash,
    channel: PROOF_CHANNEL,
  };
}

function parseMetrics(value: unknown): JobMetrics {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['execution_ms', 'proving_ms', 'verification_ms']) ||
    !isNonNegativeSafeInteger(value.execution_ms) ||
    !isNonNegativeSafeInteger(value.proving_ms) ||
    !isNonNegativeSafeInteger(value.verification_ms)
  ) {
    return invalid('The provider metrics are malformed.');
  }
  return {
    execution_ms: value.execution_ms,
    proving_ms: value.proving_ms,
    verification_ms: value.verification_ms,
  };
}

function parseResult(value: unknown): JobResult {
  if (!isPlainRecord(value) || (value.status !== 'success' && value.status !== 'error')) {
    return invalid('The result content does not contain a supported status.');
  }
  if (value.protocol !== SOUL_WIRE_PROTOCOL || !isHex64(value.request_id)) {
    return invalid('The result header is invalid.');
  }

  if (value.status === 'error') {
    if (
      !hasExactKeys(value, ['status', 'protocol', 'request_id', 'error']) ||
      !isPlainRecord(value.error) ||
      !hasExactKeys(value.error, ['code', 'message']) ||
      typeof value.error.code !== 'string' ||
      !ERROR_CODES.has(value.error.code) ||
      typeof value.error.message !== 'string' ||
      value.error.message.length === 0 ||
      [...value.error.message].length > 160 ||
      CONTROL_CHARACTER.test(value.error.message)
    ) {
      return invalid('The provider error is malformed.');
    }
    const result: FailedJobResult = {
      status: 'error',
      protocol: SOUL_WIRE_PROTOCOL,
      request_id: value.request_id,
      error: {
        code: value.error.code as ErrorCode,
        message: value.error.message,
      },
    };
    return result;
  }

  if (!hasExactKeys(value, ['status', 'protocol', 'request_id', 'statement', 'proof', 'metrics'])) {
    return invalid('The successful result has an invalid shape.');
  }
  const result: SuccessfulJobResult = {
    status: 'success',
    protocol: SOUL_WIRE_PROTOCOL,
    request_id: value.request_id,
    statement: parseStatement(value.statement),
    proof: parseProofDescriptor(value.proof),
    metrics: parseMetrics(value.metrics),
  };
  return result;
}

function readBid(tags: string[][]): number | undefined {
  const bids = tags.filter((tag) => tag[0] === 'bid');
  if (bids.length === 0) {
    return undefined;
  }
  if (bids.length !== 1 || bids[0].length !== 2 || !/^(0|[1-9][0-9]*)$/.test(bids[0][1])) {
    return invalid('The bid tag is malformed or duplicated.');
  }
  const bid = Number(bids[0][1]);
  if (!isNonNegativeSafeInteger(bid)) {
    return invalid('The bid is outside the JavaScript safe-integer range.');
  }
  return bid;
}

export function requestTags(content: JobRequestContent, bidMsats?: number): string[][] {
  if (bidMsats !== undefined && !isNonNegativeSafeInteger(bidMsats)) {
    return invalid('The bid must be a non-negative safe integer in millisatoshis.');
  }
  const canonical = serializeRequestContent(content);
  const tags = [
    ['i', canonical, 'text'],
    ['protocol', SOUL_WIRE_PROTOCOL],
    ['service', content.service],
    ['t', SOUL_TOPIC],
  ];
  if (content.expires_at !== undefined) {
    tags.push(['expiration', String(content.expires_at)]);
  }
  if (bidMsats !== undefined) {
    tags.push(['bid', String(bidMsats)]);
  }
  return tags;
}

export function validateRequestEvent(
  event: Event,
  now = Math.floor(Date.now() / 1000),
): ValidatedRequest {
  if (!verifyEvent(event)) {
    return invalid('The request event ID or signature is invalid.');
  }
  const service = serviceFromKind(event.kind);
  if (service === undefined || event.kind !== getRequestKind(service)) {
    return invalid('The event kind is not a Soul Wire request kind.');
  }
  if (utf8ByteLength(event.content) > LIMITS.MAX_REQUEST_BYTES) {
    return invalid('The request content exceeds the 16 KiB limit.');
  }
  if (
    !isNonNegativeSafeInteger(event.created_at) ||
    event.created_at > now + LIMITS.MAX_FUTURE_SKEW_SECS ||
    now - event.created_at > LIMITS.MAX_REQUEST_AGE_SECS
  ) {
    return invalid('The request timestamp is outside the accepted observation window.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return invalid('The request content is not valid JSON.');
  }
  const content = parseRequestContent(parsed, event.created_at, now);
  if (content.service !== service) {
    return invalid('The request kind does not match the declared service.');
  }
  const canonicalContent = serializeRequestContent(content);
  if (canonicalContent !== event.content) {
    return invalid('The request content is not canonical Soul Wire JSON.');
  }
  const bid = readBid(event.tags);
  if (JSON.stringify(event.tags) !== JSON.stringify(requestTags(content, bid))) {
    return invalid('The request tags are missing, reordered, duplicated, or inconsistent.');
  }
  return { event, content, canonicalContent };
}

function parseEmbeddedEvent(serialized: string): Event {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return invalid('The embedded request tag is not valid JSON.');
  }
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']) ||
    !isHex64(value.id) ||
    !isHex64(value.pubkey) ||
    typeof value.sig !== 'string' ||
    !/^[0-9a-f]{128}$/.test(value.sig) ||
    !isNonNegativeSafeInteger(value.created_at) ||
    !isNonNegativeSafeInteger(value.kind) ||
    typeof value.content !== 'string' ||
    !Array.isArray(value.tags) ||
    !value.tags.every(
      (tag) => Array.isArray(tag) && tag.length > 0 && tag.every((part) => typeof part === 'string'),
    )
  ) {
    return invalid('The embedded request event has an invalid shape.');
  }
  const event = value as unknown as Event;
  if (!verifyEvent(event)) {
    return invalid('The embedded request event is not authentic.');
  }
  return event;
}

function assertSameEvent(actual: Event, expected: Event): void {
  if (
    actual.id !== expected.id ||
    actual.pubkey !== expected.pubkey ||
    actual.created_at !== expected.created_at ||
    actual.kind !== expected.kind ||
    actual.content !== expected.content ||
    actual.sig !== expected.sig ||
    JSON.stringify(actual.tags) !== JSON.stringify(expected.tags)
  ) {
    return invalid('The result embeds a different request event.');
  }
}

function booleanFelt(value: boolean) {
  return feltFromNumber(value ? 1 : 0);
}

export function assertStatementBoundToRequest(
  statement: ProofStatement,
  request: JobRequestContent,
): void {
  if (statement.service !== request.service || statement.output.type !== request.service) {
    return invalid('The proof statement service is not bound to the request.');
  }

  let expectedInput: string[];
  let expectedOutput: string[];
  switch (request.input.type) {
    case ServiceType.Fibonacci:
      if (statement.output.type !== ServiceType.Fibonacci) {
        return invalid('The Fibonacci proof output is malformed.');
      }
      expectedInput = [feltFromNumber(request.input.n)];
      expectedOutput = [statement.output.result];
      break;
    case ServiceType.HashVerify:
      if (statement.output.type !== ServiceType.HashVerify) {
        return invalid('The hash proof output is malformed.');
      }
      expectedInput = [request.input.hash];
      expectedOutput = [booleanFelt(statement.output.valid)];
      break;
    case ServiceType.MerkleProof:
      if (statement.output.type !== ServiceType.MerkleProof) {
        return invalid('The Merkle proof output is malformed.');
      }
      expectedInput = [
        request.input.root,
        request.input.leaf,
        feltFromNumber(request.input.index),
      ];
      expectedOutput = [booleanFelt(statement.output.valid)];
      break;
  }
  if (
    JSON.stringify(statement.public_input) !== JSON.stringify(expectedInput) ||
    JSON.stringify(statement.public_output) !== JSON.stringify(expectedOutput)
  ) {
    return invalid('The proof statement public values do not match the signed request and output.');
  }
}

export function validateResultEvent(
  event: Event,
  request: ValidatedRequest,
  now = Math.floor(Date.now() / 1000),
): ValidatedResult {
  if (!verifyEvent(event)) {
    return invalid('The result event ID or signature is invalid.');
  }
  if (event.kind !== getResultKind(request.content.service)) {
    return invalid('The result kind does not match the request service.');
  }
  if (utf8ByteLength(event.content) > LIMITS.MAX_RESULT_BYTES) {
    return invalid('The result content exceeds the 32 KiB limit.');
  }
  if (
    !isNonNegativeSafeInteger(event.created_at) ||
    event.created_at < request.event.created_at ||
    event.created_at > now + LIMITS.MAX_FUTURE_SKEW_SECS
  ) {
    return invalid('The result timestamp is inconsistent with the request.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return invalid('The result content is not valid JSON.');
  }
  const content = parseResult(parsed);
  if (serializeResult(content) !== event.content) {
    return invalid('The result content is not canonical Soul Wire JSON.');
  }
  if (content.request_id !== request.event.id) {
    return invalid('The result request ID does not match the signed request.');
  }
  if (content.status === 'success') {
    assertStatementBoundToRequest(content.statement, request.content);
  }

  if (event.tags.length !== 8 || event.tags[0]?.length !== 2 || event.tags[0][0] !== 'request') {
    return invalid('The result tags have an invalid canonical shape.');
  }
  const embedded = parseEmbeddedEvent(event.tags[0][1]);
  assertSameEvent(embedded, request.event);
  const expectedTags = [
    ['request', event.tags[0][1]],
    ['e', request.event.id],
    ['p', request.event.pubkey],
    ['i', request.canonicalContent, 'text'],
    ['status', content.status],
    ['protocol', SOUL_WIRE_PROTOCOL],
    ['service', request.content.service],
    ['t', SOUL_TOPIC],
  ];
  if (JSON.stringify(event.tags) !== JSON.stringify(expectedTags)) {
    return invalid('The result tags are reordered, duplicated, or inconsistent.');
  }
  return { event, content };
}
