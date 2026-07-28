# Provider deployment

This guide describes the current research-alpha provider. The Compose stack is
for local development, not an internet-facing production deployment.

## Required production configuration

```text
SOUL_PROVIDER_MODE=production
SOUL_PROVIDER_RELAYS=wss://relay-one.example,wss://relay-two.example
SOUL_PROVIDER_SECRET_KEY_FILE=/run/credentials/soul-provider-key
SOUL_PROVIDER_NAME=<log/process label>
SOUL_PROVIDER_HTTP_ADDR=0.0.0.0:8081
SOUL_PROVIDER_ARTIFACT_DIR=/var/lib/soul/proofs
SOUL_PROVIDER_PUBLIC_BASE_URL=https://proofs.example
SOUL_PROVIDER_MAX_CONCURRENT_PROOFS=1
SOUL_CAIRO_EXECUTABLE=/opt/soul/soul_cairo.executable.json
SOUL_CAIRO_PROGRAM_HASH=<reviewed protocol/programs.json value>
SOUL_CAIRO_EXECUTABLE_SHA256=<reviewed protocol/programs.json value>
```

Production mode refuses missing relay, key, artifact URL, executable, or
program trust values, and it refuses plaintext relay URLs. Development/test
mode may use an ephemeral Nostr identity, but program identity is never
discovered at runtime. Engine startup hashes the executable and fails if it
does not match the reviewed manifest.

## Network surface

Expose only:

- outbound WebSocket/TLS to chosen Nostr relays;
- inbound HTTPS for `/healthz` and `/v1/proofs/{sha256}.json`.

Terminate TLS in a maintained reverse proxy. Permit `GET` and `HEAD` for public
proof artifacts, no credentials, and a CORS policy compatible with independent
browser verification. Apply request, response, connection, and rate limits.

The provider HTTP listener must not be used as an administrative interface.

## Persistent state

Mount `SOUL_PROVIDER_ARTIFACT_DIR` on a quota-controlled persistent volume.
Hash-named artifacts are immutable. Define retention based on the result
lifetime you promise; deletion does not invalidate a proof already fetched, but
it removes availability for future clients.

The in-memory duplicate set is intentionally bounded and is not durable across
restart. Operators needing exactly-once commercial semantics need a durable job
ledger before adding payments.

## Secrets

Inject the Nostr secret from a secret manager. Set either
`SOUL_PROVIDER_SECRET_KEY_FILE` or `SOUL_PROVIDER_SECRET_KEY`, never both. The
file form must be a regular file no larger than 256 bytes, contain one
unpadded secret (an optional final newline is accepted), and on Unix must have
no group/other permission bits. Do not place the secret in an image layer,
Compose file, shell history, log, or browser storage.

Rotate it as a provider-identity change. Publish the new public key through a
separately authenticated channel and update each client's explicit provider
allowlist; relay discovery alone is not authorization.

## Capacity

Start with one concurrent proof per process. Measure representative workloads
before raising the limit. Apply container CPU, memory, PID, file-descriptor, and
disk limits. A semaphore limits concurrent work inside the process; it is not a
host resource governor.

## Health and observability

`GET /healthz` reports process health. It does not promise relay reachability,
available proving capacity, or proof correctness. Alert separately on:

- process restarts and health failures;
- relay disconnect/reconnect loops;
- busy responses and proving-capacity saturation;
- proving/verification errors;
- artifact disk utilization;
- request/result latency.

Never export private input or secret-key material in logs.

## Upgrade

Dependency-only updates that leave `program_hash` unchanged still require the
full verification suite. Any program-hash change follows the trust-root update
ceremony in [security-model.md](security-model.md#program-updates). Roll out
providers and client manifests deliberately; mismatched clients should reject,
not silently downgrade.
