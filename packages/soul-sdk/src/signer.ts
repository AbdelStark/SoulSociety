import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
  type Event,
  type EventTemplate,
  type UnsignedEvent,
} from 'nostr-tools';

import { hexToBytes, isHex64 } from './utils.js';

export interface SoulSigner {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<Event>;
}

abstract class InMemorySigner implements SoulSigner {
  private secretKey: Uint8Array | undefined;

  protected constructor(secretKey: Uint8Array) {
    if (secretKey.byteLength !== 32) {
      throw new TypeError('A Nostr secret key needs to contain exactly 32 bytes.');
    }
    this.secretKey = new Uint8Array(secretKey);
  }

  async getPublicKey(): Promise<string> {
    return getPublicKey(this.requireKey());
  }

  async signEvent(template: EventTemplate): Promise<Event> {
    return finalizeEvent({ ...template, tags: template.tags.map((tag) => [...tag]) }, this.requireKey());
  }

  destroy(): void {
    this.secretKey?.fill(0);
    this.secretKey = undefined;
  }

  private requireKey(): Uint8Array {
    if (!this.secretKey) {
      throw new Error('This signer has been destroyed.');
    }
    return this.secretKey;
  }
}

export class EphemeralSigner extends InMemorySigner {
  constructor() {
    super(generateSecretKey());
  }
}

export class SecretKeySigner extends InMemorySigner {
  constructor(secretKey: string | Uint8Array) {
    if (typeof secretKey === 'string' && !isHex64(secretKey)) {
      throw new TypeError('A secret key needs to be 64 lowercase hexadecimal characters.');
    }
    super(typeof secretKey === 'string' ? hexToBytes(secretKey) : secretKey);
  }
}

export interface Nip07Provider {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<Event>;
}

export class Nip07Signer implements SoulSigner {
  constructor(private readonly provider: Nip07Provider) {}

  async getPublicKey(): Promise<string> {
    const publicKey = await this.provider.getPublicKey();
    if (!isHex64(publicKey)) {
      throw new Error('The NIP-07 signer returned an invalid public key.');
    }
    return publicKey;
  }

  async signEvent(template: EventTemplate): Promise<Event> {
    const publicKey = await this.getPublicKey();
    const unsigned: UnsignedEvent = {
      ...template,
      tags: template.tags.map((tag) => [...tag]),
      pubkey: publicKey,
    };
    const signed = await this.provider.signEvent(unsigned);

    if (
      signed.pubkey !== publicKey ||
      signed.kind !== template.kind ||
      signed.created_at !== template.created_at ||
      signed.content !== template.content ||
      JSON.stringify(signed.tags) !== JSON.stringify(template.tags) ||
      !verifyEvent(signed)
    ) {
      throw new Error('The NIP-07 signer changed or invalidated the Soul Wire request.');
    }
    return signed;
  }
}
