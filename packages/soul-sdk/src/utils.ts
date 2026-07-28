import { CAIRO_PRIME_HEX } from './constants.js';
import type { FieldElement } from './types.js';

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const FELT = /^0x[0-9a-f]{64}$/;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value)) {
    throw new TypeError('Hex needs to contain an even number of lowercase hexadecimal characters.');
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function isHex64(value: unknown): value is string {
  return typeof value === 'string' && LOWER_HEX_64.test(value);
}

export function isFieldElement(value: unknown): value is FieldElement {
  if (typeof value !== 'string' || !FELT.test(value)) {
    return false;
  }
  return value.slice(2) < CAIRO_PRIME_HEX;
}

export function feltFromNumber(value: number): FieldElement {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('A field element source needs to be a non-negative safe integer.');
  }
  return `0x${BigInt(value).toString(16).padStart(64, '0')}`;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(hostname) ||
    hostname === '[::1]'
  );
}

export function isSafeArtifactUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    Boolean(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.hash === '' &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && isLoopbackHostname(url.hostname)))
  );
}
