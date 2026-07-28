import type { Event, EventTemplate } from 'nostr-tools';

import { buildRequestContent, canonicalizeInput, serializeRequestContent } from './canonical.js';
import { DEFAULT_RELAYS, LIMITS, getRequestKind, getResultKind } from './constants.js';
import { errorMessage, SoulWireError } from './errors.js';
import { fetchProofArtifact, verifyProofBytes, type ProofVerifier } from './proof.js';
import type { SoulSigner } from './signer.js';
import { NostrPoolTransport, normalizeRelays, type SoulTransport } from './transport.js';
import { ErrorCode } from './types.js';
import type {
  FieldElement,
  Hex64,
  JobFailure,
  JobInput,
  JobListener,
  JobSnapshot,
  SuccessfulJobResult,
  ValidatedResult,
  VerifiedJob,
} from './types.js';
import {
  requestTags,
  validateJobInput,
  validateRequestEvent,
  validateResultEvent,
} from './validation.js';
import { isFieldElement, isHex64 } from './utils.js';

export interface SoulNostrClientOptions {
  signer: SoulSigner;
  verifier: ProofVerifier;
  trustedProgramHash: FieldElement;
  /**
   * Provider identities accepted to settle a job.
   *
   * This trust root is application policy, not relay discovery. At least one
   * canonical x-only Nostr public key is required.
   */
  trustedProviderPubkeys: readonly Hex64[];
  relays?: readonly string[];
  transport?: SoulTransport;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}

const MAX_TRUSTED_PROVIDERS = 64;

function normalizeTrustedProviderPubkeys(values: readonly Hex64[]): readonly Hex64[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('At least one trusted provider public key is required.');
  }
  if (values.length > MAX_TRUSTED_PROVIDERS) {
    throw new RangeError(`At most ${MAX_TRUSTED_PROVIDERS} trusted providers are allowed.`);
  }
  const normalized = [...new Set(values)];
  if (normalized.some((value) => !isHex64(value))) {
    throw new TypeError(
      'Trusted provider public keys must contain exactly 64 lowercase hexadecimal characters.',
    );
  }
  return Object.freeze(normalized);
}

export interface CreateJobOptions {
  bidMsats?: number;
  expiresInSeconds?: number;
  resultTimeoutMs?: number;
  proofTimeoutMs?: number;
  publishRetries?: number;
  proofRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_JOB_OPTIONS: Required<CreateJobOptions> = {
  bidMsats: 0,
  expiresInSeconds: 5 * 60,
  resultTimeoutMs: 2 * 60 * 1000,
  proofTimeoutMs: 30 * 1000,
  publishRetries: 2,
  proofRetries: 2,
  retryDelayMs: 350,
};

const RETRYABLE_PROVIDER_ERRORS = new Set<ErrorCode>([
  ErrorCode.Busy,
  ErrorCode.ProvingFailed,
  ErrorCode.ArtifactUnavailable,
  ErrorCode.Internal,
]);

class ProviderResultError extends Error {
  constructor(readonly failure: JobFailure) {
    super(failure.message);
    this.name = 'ProviderResultError';
  }
}

function validateJobOptions(value: CreateJobOptions): Required<CreateJobOptions> {
  const options = { ...DEFAULT_JOB_OPTIONS, ...value };
  const integerFields: Array<keyof Required<CreateJobOptions>> = [
    'bidMsats',
    'expiresInSeconds',
    'resultTimeoutMs',
    'proofTimeoutMs',
    'publishRetries',
    'proofRetries',
    'retryDelayMs',
  ];
  for (const field of integerFields) {
    if (!Number.isSafeInteger(options[field]) || options[field] < 0) {
      throw new TypeError(`${field} must be a non-negative safe integer.`);
    }
  }
  if (options.expiresInSeconds === 0 || options.expiresInSeconds > 60 * 60) {
    throw new RangeError('expiresInSeconds must be between 1 and 3600.');
  }
  if (options.resultTimeoutMs === 0 || options.proofTimeoutMs === 0) {
    throw new RangeError('Result and proof timeouts must be greater than zero.');
  }
  return options;
}

function cloneSnapshot(snapshot: JobSnapshot): JobSnapshot {
  return { ...snapshot };
}

export class SoulJob {
  private snapshot: JobSnapshot;
  private readonly listeners = new Set<JobListener>();
  private abortController = new AbortController();
  private unsubscribeResult: (() => void) | undefined;
  private running: Promise<VerifiedJob> | undefined;

  constructor(
    input: JobInput,
    private readonly client: SoulNostrClient,
    private readonly options: Required<CreateJobOptions>,
  ) {
    const canonicalInput = canonicalizeInput(validateJobInput(input));
    this.snapshot = {
      state: 'draft',
      input: canonicalInput,
      publishAttempt: 0,
      proofAttempt: 0,
      updatedAt: Date.now(),
    };
  }

  getSnapshot(): Readonly<JobSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  subscribe(listener: JobListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  start(): Promise<VerifiedJob> {
    if (this.running) {
      return this.running;
    }
    if (this.snapshot.state !== 'draft') {
      return Promise.reject(new Error('Only a draft Soul job can be started.'));
    }
    this.running = this.run().finally(() => {
      this.running = undefined;
      this.unsubscribeResult?.();
      this.unsubscribeResult = undefined;
    });
    return this.running;
  }

  async retry(): Promise<VerifiedJob> {
    if (this.snapshot.state !== 'failed' || !this.snapshot.failure?.retryable) {
      throw new Error('This job is not in a retryable failed state.');
    }
    if (this.running) {
      try {
        await this.running;
      } catch {
        // The failed execution is already reflected in the public snapshot.
      }
    }
    this.abortController = new AbortController();
    this.update({
      state: 'draft',
      request: undefined,
      result: undefined,
      verified: undefined,
      failure: undefined,
      publishAttempt: 0,
      proofAttempt: 0,
    });
    return this.start();
  }

  cancel(): void {
    if (this.snapshot.state === 'verified' || this.snapshot.state === 'failed') {
      return;
    }
    this.abortController.abort(new Error('Job cancelled.'));
    this.unsubscribeResult?.();
    this.unsubscribeResult = undefined;
    this.fail({
      code: 'cancelled',
      message: 'The job was cancelled locally.',
      retryable: false,
    });
  }

  private async run(): Promise<VerifiedJob> {
    try {
      const createdAt = this.client.now();
      const content = buildRequestContent(
        this.snapshot.input,
        createdAt + this.options.expiresInSeconds,
      );
      const template: EventTemplate = {
        kind: getRequestKind(content.service),
        created_at: createdAt,
        tags: requestTags(content, this.options.bidMsats),
        content: serializeRequestContent(content),
      };
      this.update({ state: 'publishing' });
      const signed = await this.client.signer.signEvent(template);
      this.assertActive();
      const request = validateRequestEvent(signed, this.client.now());
      this.update({ request });

      await this.publishWithRetry(signed);
      this.assertActive();
      this.update({ state: 'awaiting_result' });

      const result = await this.waitForResult(request);
      this.assertActive();
      this.update({ result });
      if (result.content.status === 'error') {
        throw new ProviderResultError({
          code: result.content.error.code,
          message: result.content.error.message,
          retryable: RETRYABLE_PROVIDER_ERRORS.has(result.content.error.code),
        });
      }

      this.update({ state: 'result_received' });
      if (result.content.proof.program_hash !== this.client.trustedProgramHash) {
        throw new SoulWireError(
          'untrusted_program',
          'The proof descriptor does not match the reviewed program manifest.',
          false,
        );
      }

      this.update({ state: 'fetching' });
      const proofBytes = await this.fetchWithRetry(result.content);
      this.assertActive();
      this.update({ state: 'verifying' });
      await verifyProofBytes(
        result.content,
        proofBytes,
        this.client.trustedProgramHash,
        this.client.verifier,
      );
      this.assertActive();

      const verified: VerifiedJob = {
        request,
        result: result as ValidatedResult & { content: SuccessfulJobResult },
        proofBytes,
      };
      this.update({ state: 'verified', verified });
      return verified;
    } catch (error) {
      if (this.snapshot.state !== 'failed') {
        this.fail(this.failureFor(error));
      }
      throw error;
    }
  }

  private async publishWithRetry(event: Event): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.options.publishRetries + 1; attempt += 1) {
      this.assertActive();
      this.update({ publishAttempt: attempt });
      try {
        await this.client.transport.publish(this.client.relays, event);
        return;
      } catch (error) {
        lastError = error;
        if (attempt <= this.options.publishRetries) {
          await this.delay(this.options.retryDelayMs * attempt);
        }
      }
    }
    throw new SoulWireError(
      'publish_failed',
      `No configured relay accepted the signed request: ${errorMessage(lastError)}`,
      true,
      { cause: lastError },
    );
  }

  private waitForResult(request: NonNullable<JobSnapshot['request']>): Promise<ValidatedResult> {
    return new Promise((resolve, reject) => {
      const seen = new Set<string>();
      const seenOrder: string[] = [];
      const timeout = globalThis.setTimeout(() => {
        this.unsubscribeResult?.();
        this.unsubscribeResult = undefined;
        reject(
          new SoulWireError(
            'result_timeout',
            'No authentic Soul Wire result arrived before the local timeout.',
            true,
          ),
        );
      }, this.options.resultTimeoutMs);

      const close = () => {
        globalThis.clearTimeout(timeout);
        this.unsubscribeResult?.();
        this.unsubscribeResult = undefined;
      };
      this.abortController.signal.addEventListener(
        'abort',
        () => {
          close();
          reject(new SoulWireError('cancelled', 'The job was cancelled locally.', false));
        },
        { once: true },
      );
      this.unsubscribeResult = this.client.transport.subscribe(
        this.client.relays,
        {
          kinds: [getResultKind(request.content.service)],
          authors: [...this.client.trustedProviderPubkeys],
          '#e': [request.event.id],
          since: request.event.created_at,
        },
        (event) => {
          if (!this.client.acceptsProvider(event.pubkey)) {
            return;
          }
          if (seen.has(event.id)) {
            return;
          }
          if (seenOrder.length === LIMITS.MAX_DEDUPE_ENTRIES) {
            const oldest = seenOrder.shift();
            if (oldest !== undefined) {
              seen.delete(oldest);
            }
          }
          seen.add(event.id);
          seenOrder.push(event.id);
          try {
            const result = validateResultEvent(event, request, this.client.now());
            close();
            resolve(result);
          } catch {
            // Invalid or unrelated relay traffic is ignored; only an authentic,
            // request-bound result can settle this job.
          }
        },
      );
    });
  }

  private async fetchWithRetry(result: SuccessfulJobResult): Promise<Uint8Array> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.options.proofRetries + 1; attempt += 1) {
      this.assertActive();
      this.update({ proofAttempt: attempt });
      try {
        return await fetchProofArtifact(result.proof, {
          fetch: this.client.fetchImpl,
          signal: this.abortController.signal,
          timeoutMs: this.options.proofTimeoutMs,
        });
      } catch (error) {
        lastError = error;
        if (
          error instanceof SoulWireError &&
          (!error.retryable || attempt > this.options.proofRetries)
        ) {
          throw error;
        }
        if (attempt <= this.options.proofRetries) {
          await this.delay(this.options.retryDelayMs * attempt);
        }
      }
    }
    throw lastError;
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(resolve, milliseconds);
      this.abortController.signal.addEventListener(
        'abort',
        () => {
          globalThis.clearTimeout(timeout);
          reject(new SoulWireError('cancelled', 'The job was cancelled locally.', false));
        },
        { once: true },
      );
    });
  }

  private assertActive(): void {
    if (this.abortController.signal.aborted) {
      throw new SoulWireError('cancelled', 'The job was cancelled locally.', false);
    }
  }

  private failureFor(error: unknown): JobFailure {
    if (error instanceof ProviderResultError) {
      return error.failure;
    }
    if (error instanceof SoulWireError) {
      return error.toFailure();
    }
    return {
      code: ErrorCode.InvalidRequest,
      message: errorMessage(error),
      retryable: false,
    };
  }

  private fail(failure: JobFailure): void {
    this.update({ state: 'failed', failure });
  }

  private update(patch: Partial<JobSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, updatedAt: Date.now() };
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export class SoulNostrClient {
  readonly signer: SoulSigner;
  readonly verifier: ProofVerifier;
  readonly trustedProgramHash: FieldElement;
  readonly trustedProviderPubkeys: readonly Hex64[];
  readonly relays: string[];
  readonly transport: SoulTransport;
  readonly fetchImpl: typeof globalThis.fetch | undefined;
  private readonly nowImpl: () => number;
  private readonly trustedProviderSet: ReadonlySet<Hex64>;
  private readonly jobs = new Set<SoulJob>();

  constructor(options: SoulNostrClientOptions) {
    if (!isFieldElement(options.trustedProgramHash)) {
      throw new TypeError('trustedProgramHash must be a canonical Cairo field element.');
    }
    this.signer = options.signer;
    this.verifier = options.verifier;
    this.trustedProgramHash = options.trustedProgramHash;
    this.trustedProviderPubkeys = normalizeTrustedProviderPubkeys(
      options.trustedProviderPubkeys,
    );
    this.trustedProviderSet = new Set(this.trustedProviderPubkeys);
    this.relays = normalizeRelays(options.relays ?? DEFAULT_RELAYS);
    this.transport = options.transport ?? new NostrPoolTransport();
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.nowImpl = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  now(): number {
    return this.nowImpl();
  }

  getRelays(): string[] {
    return [...this.relays];
  }

  getPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }

  acceptsProvider(pubkey: string): pubkey is Hex64 {
    return isHex64(pubkey) && this.trustedProviderSet.has(pubkey);
  }

  createJob(input: JobInput, options: CreateJobOptions = {}): SoulJob {
    const job = new SoulJob(input, this, validateJobOptions(options));
    this.jobs.add(job);
    return job;
  }

  close(): void {
    for (const job of this.jobs) {
      job.cancel();
    }
    this.jobs.clear();
    this.transport.close(this.relays);
  }
}
