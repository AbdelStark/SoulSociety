import {
  CAIRO_PROGRAM,
  SOUL_WIRE_PROTOCOL,
  isFieldElement,
  isHex64,
  type FieldElement,
  type ProofVerifier,
} from '@soul-society/sdk';

export interface VerifierManifest {
  protocol: typeof SOUL_WIRE_PROTOCOL;
  program: typeof CAIRO_PROGRAM;
  program_hash: FieldElement;
}

interface SoulWasmModule {
  default(input?: {
    module_or_path: string | URL | Request | Response | BufferSource;
  }): Promise<unknown>;
  WasmVerifier: new () => {
    verifyProof(
      proofBytes: Uint8Array,
      expectedProgramHash: string,
      expectedStatementJson: string,
    ): boolean;
    free?: () => void;
  };
}

export interface LoadedBrowserVerifier {
  verifier: ProofVerifier;
  manifest: VerifierManifest;
}

let pendingVerifier: Promise<LoadedBrowserVerifier> | undefined;

function verifierAssetUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}wasm/${filename}`;
}

function parseManifest(value: unknown): VerifierManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The reviewed verifier manifest is not an object.');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const programs =
    typeof record.programs === 'object' && record.programs !== null && !Array.isArray(record.programs)
      ? (record.programs as Record<string, unknown>)
      : undefined;
  const program =
    typeof programs?.[CAIRO_PROGRAM] === 'object' &&
    programs[CAIRO_PROGRAM] !== null &&
    !Array.isArray(programs[CAIRO_PROGRAM])
      ? (programs[CAIRO_PROGRAM] as Record<string, unknown>)
      : undefined;
  const programKeys = program ? Object.keys(program).sort().join(',') : '';
  if (
    keys.join(',') !== 'programs,protocol,schema_version' ||
    record.schema_version !== 1 ||
    record.protocol !== SOUL_WIRE_PROTOCOL ||
    !program ||
    programKeys !==
      'artifact,artifact_sha256,cairo,channel,program_hash,proof_format,scarb,stwo_cairo' ||
    !isFieldElement(program.program_hash) ||
    !isHex64(program.artifact_sha256) ||
    typeof program.artifact !== 'string' ||
    typeof program.cairo !== 'string' ||
    typeof program.scarb !== 'string' ||
    typeof program.stwo_cairo !== 'string' ||
    program.proof_format !== 'stwo-cairo-json-v1' ||
    program.channel !== 'blake2s'
  ) {
    throw new Error('The reviewed verifier manifest is malformed or incompatible.');
  }
  return {
    protocol: SOUL_WIRE_PROTOCOL,
    program: CAIRO_PROGRAM,
    program_hash: program.program_hash,
  };
}

async function load(): Promise<LoadedBrowserVerifier> {
  const manifestResponse = await fetch(verifierAssetUrl('programs.json'), {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!manifestResponse.ok) {
    throw new Error(`Verifier manifest unavailable (HTTP ${manifestResponse.status}).`);
  }
  const manifest = parseManifest(await manifestResponse.json());

  const moduleUrl = verifierAssetUrl('soul_wasm.js');
  const wasm = (await import(/* @vite-ignore */ moduleUrl)) as SoulWasmModule;
  await wasm.default({ module_or_path: verifierAssetUrl('soul_wasm_bg.wasm') });
  const nativeVerifier = new wasm.WasmVerifier();

  return {
    manifest,
    verifier: {
      verifyProof(proofBytes, expectedProgramHash, expectedStatementJson) {
        if (expectedProgramHash !== manifest.program_hash) {
          return false;
        }
        return nativeVerifier.verifyProof(
          proofBytes,
          expectedProgramHash,
          expectedStatementJson,
        );
      },
    },
  };
}

export function loadBrowserVerifier(): Promise<LoadedBrowserVerifier> {
  pendingVerifier ??= load();
  return pendingVerifier;
}
