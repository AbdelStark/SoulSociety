import type { JobFailure, LocalFailureCode } from './types.js';

export class SoulWireError extends Error {
  readonly code: LocalFailureCode;
  readonly retryable: boolean;

  constructor(code: LocalFailureCode, message: string, retryable = false, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SoulWireError';
    this.code = code;
    this.retryable = retryable;
  }

  toFailure(): JobFailure {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred.';
}
