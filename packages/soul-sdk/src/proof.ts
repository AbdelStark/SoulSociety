import { LIMITS, PROOF_MEDIA_TYPE } from './constants.js';
import { serializeProofStatement } from './canonical.js';
import { SoulWireError } from './errors.js';
import type {
  FieldElement,
  ProofDescriptor,
  ProofStatement,
  SuccessfulJobResult,
} from './types.js';
import { bytesToHex, isSafeArtifactUrl } from './utils.js';

export interface ProofVerifier {
  verifyProof(
    proofBytes: Uint8Array,
    expectedProgramHash: FieldElement,
    expectedStatementJson: string,
  ): boolean | Promise<boolean>;
}

export interface ProofFetchOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function validateFetchedUrl(value: string): void {
  if (!isSafeArtifactUrl(value)) {
    throw new SoulWireError(
      'proof_fetch_failed',
      'Proof URLs require HTTPS without credentials or fragments; HTTP is loopback-only.',
      false,
    );
  }
}

function combinedAbortSignal(
  source: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(source?.reason);
  source?.addEventListener('abort', onAbort, { once: true });
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('Proof download timed out.')),
    timeoutMs,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      globalThis.clearTimeout(timeout);
      source?.removeEventListener('abort', onAbort);
    },
  };
}

export async function fetchProofArtifact(
  descriptor: ProofDescriptor,
  options: ProofFetchOptions = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new SoulWireError('proof_fetch_failed', 'No Fetch implementation is available.', false);
  }
  validateFetchedUrl(descriptor.url);
  const abort = combinedAbortSignal(options.signal, options.timeoutMs ?? 30_000);

  try {
    const response = await fetchImpl(descriptor.url, {
      method: 'GET',
      headers: { Accept: PROOF_MEDIA_TYPE },
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: abort.signal,
    });
    if (!response.ok) {
      throw new SoulWireError(
        'proof_fetch_failed',
        `The proof server returned HTTP ${response.status}.`,
        response.status >= 500 || response.status === 408 || response.status === 429,
      );
    }
    validateFetchedUrl(response.url || descriptor.url);
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== PROOF_MEDIA_TYPE) {
      throw new SoulWireError(
        'proof_fetch_failed',
        `The proof server must return ${PROOF_MEDIA_TYPE}.`,
        false,
      );
    }

    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader !== null) {
      const length = Number(lengthHeader);
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > LIMITS.MAX_PROOF_BYTES ||
        length !== descriptor.byte_size
      ) {
        throw new SoulWireError(
          'proof_fetch_failed',
          'The HTTP content length does not match the signed proof descriptor.',
          false,
        );
      }
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    if (!response.body) {
      throw new SoulWireError(
        'proof_fetch_failed',
        'The Fetch implementation cannot stream the proof response safely.',
        false,
      );
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > LIMITS.MAX_PROOF_BYTES || total > descriptor.byte_size) {
        await reader.cancel('Proof response exceeded its declared size.');
        throw new SoulWireError('proof_fetch_failed', 'The proof response exceeded its declared size.', false);
      }
      chunks.push(value);
    }
    if (total !== descriptor.byte_size) {
      throw new SoulWireError(
        'proof_fetch_failed',
        'The proof byte count does not match its signed descriptor.',
        true,
      );
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    if (bytesToHex(digest) !== descriptor.sha256) {
      bytes.fill(0);
      throw new SoulWireError(
        'proof_hash_mismatch',
        'The proof bytes do not match the signed SHA-256 digest.',
        true,
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof SoulWireError) {
      throw error;
    }
    if (abort.signal.aborted) {
      throw new SoulWireError(
        'proof_fetch_failed',
        options.signal?.aborted ? 'The proof download was cancelled.' : 'The proof download timed out.',
        !options.signal?.aborted,
        { cause: error },
      );
    }
    throw new SoulWireError('proof_fetch_failed', 'The proof artifact could not be downloaded.', true, {
      cause: error,
    });
  } finally {
    abort.dispose();
  }
}

export async function verifyProofBytes(
  result: SuccessfulJobResult,
  proofBytes: Uint8Array,
  trustedProgramHash: FieldElement,
  verifier: ProofVerifier,
): Promise<void> {
  if (
    result.proof.program_hash !== trustedProgramHash ||
    result.statement.program !== 'soul-cairo-v1'
  ) {
    throw new SoulWireError(
      'untrusted_program',
      'The result does not match the reviewed Cairo program hash.',
      false,
    );
  }

  let verified: boolean;
  try {
    verified = await verifier.verifyProof(
      proofBytes,
      trustedProgramHash,
      serializeProofStatement(result.statement as ProofStatement),
    );
  } catch (error) {
    throw new SoulWireError(
      'verification_failed',
      'The local STWO verifier could not validate this proof.',
      false,
      { cause: error },
    );
  }
  if (!verified) {
    throw new SoulWireError(
      'verification_failed',
      'The local STWO verifier rejected this proof.',
      false,
    );
  }
}
