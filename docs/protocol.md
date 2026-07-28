# Soul Wire v1

Status: research-alpha application microstandard.

Soul Wire transports requests and proof descriptors over Nostr. It borrows the
5xxx/6xxx request/result pairing explored by NIP-90 but does not claim NIP-90
compliance. The protocol identifier is exactly:

```text
soul-society/1
```

Normative words such as MUST and SHOULD are used in their ordinary
specification sense.

## Event kinds

| Service | Request | Result |
|---|---:|---:|
| `fibonacci` | `5601` | `6601` |
| `hash_verify` | `5602` | `6602` |
| `merkle_proof` | `5603` | `6603` |

A result kind is its request kind plus 1000.

## Service semantics

The reviewed `soul-cairo-v1` program defines these computations:

- `fibonacci`: `F(0) = 0`, `F(1) = 1`, and
  `F(n) = F(n - 1) + F(n - 2)` for `0 ≤ n ≤ 363`.
- `hash_verify`: compute Cairo core
  `poseidon_hash_span([preimage])` and return `1` exactly when it equals
  `expected_hash`, otherwise `0`.
- `merkle_proof`: start with `current = leaf`. For each sibling from leaf level
  upward, hash `[current, sibling]` when the corresponding low-to-high bit of
  `index` is zero, or `[sibling, current]` when it is one, using
  `poseidon_hash_span`. The result is `1` exactly when the final value equals
  `root`. An empty path requires `index = 0` and succeeds exactly when
  `leaf == root`.

For the two verification services, `valid: false` is a successful proven
computation, not a protocol error.

## Canonical values

- JSON keys and enum values are snake_case.
- Unknown object fields are invalid.
- A Cairo field element MUST be `0x` followed by exactly 64 lowercase
  hexadecimal nibbles and MUST be smaller than the Cairo prime.
- Event IDs, public keys, signatures, and SHA-256 values use lowercase hex
  without `0x` where Nostr or this document specifies that form.
- Producers serialize compact canonical JSON in declaration order. Consumers
  parse the typed value, serialize it canonically, and require byte-for-byte
  equality with event content.
- The tag arrays shown below are complete and ordered. Producers MUST emit
  exactly that order; consumers MUST reject reordering, duplicates, and unknown
  extra tags.

## Request

Example content:

```json
{"protocol":"soul-society/1","service":"fibonacci","input":{"type":"fibonacci","n":10},"expires_at":1900000600}
```

Input variants:

```json
{"type":"fibonacci","n":10}
{"type":"hash_verify","hash":"0x0000000000000000000000000000000000000000000000000000000000000001","preimage":"0x0000000000000000000000000000000000000000000000000000000000000002"}
{"type":"merkle_proof","root":"0x…64 lowercase nibbles…","leaf":"0x…64 lowercase nibbles…","proof":["0x…"],"index":0}
```

Required singleton tags:

```json
["i", "<exact canonical content>", "text"]
["protocol", "soul-society/1"]
["service", "<service>"]
["t", "soul-society"]
```

Optional singleton tags:

```json
["expiration", "<unix seconds>"]
["bid", "<integer millisatoshis from 0 through 9007199254740991>"]
```

If content has `expires_at`, the matching `expiration` tag is required. If
content has no expiry, that tag is forbidden.

Consumers and providers reject:

- invalid event IDs or signatures;
- a request kind that does not match `service` and the typed input;
- missing, duplicated, malformed, or contradictory singleton tags;
- non-canonical content;
- requests larger than 16 KiB;
- events older than 10 minutes or more than 5 minutes in the future;
- expiries at/before observation time, before creation, or over one hour after
  creation;
- Fibonacci `n > 363`;
- Merkle paths deeper than 32 or an index that does not fit the path depth.

The `bid` value is metadata only in this version. Soul Wire defines no payment,
escrow, or settlement semantics.

## Result

A success content object has:

```json
{
  "status": "success",
  "protocol": "soul-society/1",
  "request_id": "<64 hex event id>",
  "statement": {
    "service": "fibonacci",
    "program": "soul-cairo-v1",
    "public_input": ["0x000000000000000000000000000000000000000000000000000000000000000a"],
    "public_output": ["0x0000000000000000000000000000000000000000000000000000000000000037"],
    "output": {
      "type": "fibonacci",
      "result": "0x0000000000000000000000000000000000000000000000000000000000000037"
    }
  },
  "proof": {
    "format": "stwo-cairo-json-v1",
    "media_type": "application/vnd.soul-society.stwo-proof+json",
    "url": "https://proofs.example/v1/proofs/<sha256>.json",
    "sha256": "<64 lowercase hex>",
    "byte_size": 123456,
    "program_hash": "0x<64 lowercase hex>",
    "channel": "blake2s"
  },
  "metrics": {
    "execution_ms": 1,
    "proving_ms": 2,
    "verification_ms": 3
  }
}
```

Metrics are provider measurements. The proof does not attest to elapsed time.
Each metric MUST be an integer from `0` through `9007199254740991` so Rust and
JavaScript interpret the signed value identically.

An error has:

```json
{
  "status": "error",
  "protocol": "soul-society/1",
  "request_id": "<64 hex event id>",
  "error": {
    "code": "invalid_request",
    "message": "bounded public message"
  }
}
```

Stable error codes are:

- `invalid_request`
- `unsupported_service`
- `expired`
- `duplicate`
- `busy`
- `proving_failed`
- `artifact_unavailable`
- `internal`

The public error message MUST contain 1 through 160 Unicode scalar values and
MUST NOT contain control characters. It is diagnostic metadata, not a proof
claim.

Result singleton tags:

```json
["request", "<complete serialized signed request event>"]
["e", "<request event id>"]
["p", "<request author public key>"]
["i", "<exact canonical request content>", "text"]
["status", "success" | "error"]
["protocol", "soul-society/1"]
["service", "<service>"]
["t", "soul-society"]
```

The embedded request makes result verification independent of relay history.
It MUST be a JSON object containing exactly `id`, `pubkey`, `created_at`,
`kind`, `tags`, `content`, and `sig`. JSON object member order and insignificant
whitespace are not normative. The parsed event MUST authenticate successfully
and MUST be semantically identical to the original signed request in all seven
fields. Every other result tag array, its position, and its scalar values are
exact; extra, missing, duplicated, or reordered tags are invalid.

Result timestamps MUST be at or after the request timestamp and no more than
five minutes ahead of the verifier's observation time. An application MUST
configure a non-empty allowlist of provider public keys out of band and MUST
ignore both success and error events signed by any other author. Relay
discovery is not provider authorization.

## Proof artifact

The artifact is canonical JSON for:

```text
CairoProofForRustVerifier<Blake2sMerkleHasher>
```

It is served at:

```text
GET /v1/proofs/{sha256}.json
```

The SDK:

1. authenticates and validates the result before fetching;
2. applies its URL policy (HTTPS by default; loopback HTTP for development);
3. rejects credentials, fragments, unsafe redirects, and declared sizes over
   32 MiB;
4. aborts if received bytes exceed the declared or global limit;
5. compares exact byte length and SHA-256;
6. requires `pow_bits = 26`, `log_blowup_factor = 1`, `n_queries = 70`,
   `log_last_layer_degree_bound = 0`, `fold_step = 1`, no fixed lifting size,
   and the canonical preprocessing trace;
7. passes bytes, the independently trusted program hash, and the expected
   statement to WASM;
8. accepts only if STWO, program identity, and statement binding all verify.

The reviewed profile targets 96 conjectured security bits
(`26 + 1 × 70`). Proof-supplied parameters never select the client's security
policy.

The descriptor's `program_hash` MUST equal the client's reviewed trust
manifest. A hash stated by an untrusted provider cannot create trust by itself.

## Private witnesses

Hash preimages and Merkle sibling paths are absent from the Cairo public output
and therefore absent from the declared proof statement. This research alpha
does not claim zero-knowledge or witness-hiding, and the unencrypted request
reveals those values in transport.

## Versioning

Consumers MUST reject an unknown protocol identifier. An incompatible JSON,
tag, program ABI, proof format, or semantic change requires a new protocol
identifier. New services require new event kinds and cross-language fixtures.
No implementation should silently “best effort” a future version.

The deterministic examples under `protocol/fixtures/wire` are executable parts
of this specification.
