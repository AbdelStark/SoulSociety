import { SimplePool, type Event, type Filter } from 'nostr-tools';

export interface SoulTransport {
  publish(relays: readonly string[], event: Event): Promise<void>;
  subscribe(
    relays: readonly string[],
    filter: Filter,
    onEvent: (event: Event) => void,
    onClose?: (reasons: string[]) => void,
  ): () => void;
  close(relays: readonly string[]): void;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

export function validateRelayUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`Invalid relay URL: ${value}`);
  }
  if (
    (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && isLocalHostname(url.hostname))) ||
    !url.hostname ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== ''
  ) {
    throw new TypeError('Relays must use wss://, except ws:// on the local development host.');
  }
  return url.pathname === '/' && url.search === ''
    ? url.toString().slice(0, -1)
    : url.toString();
}

export function normalizeRelays(values: readonly string[]): string[] {
  const relays = [...new Set(values.map((value) => validateRelayUrl(value.trim())))];
  if (relays.length === 0) {
    throw new TypeError('At least one Nostr relay is required.');
  }
  return relays;
}

export class NostrPoolTransport implements SoulTransport {
  private readonly pool = new SimplePool();

  async publish(relays: readonly string[], event: Event): Promise<void> {
    await Promise.any(this.pool.publish([...relays], event));
  }

  subscribe(
    relays: readonly string[],
    filter: Filter,
    onEvent: (event: Event) => void,
    onClose?: (reasons: string[]) => void,
  ): () => void {
    const subscription = this.pool.subscribeMany([...relays], [filter], {
      onevent: onEvent,
      onclose: onClose,
    });
    return () => subscription.close();
  }

  close(relays: readonly string[]): void {
    this.pool.close([...relays]);
  }
}
