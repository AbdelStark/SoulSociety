# Security model

Soul Society narrows trust; it does not abolish assumptions.

## Verification claim

When the client reaches `verified`, it has established:

> Under the implemented STWO verifier and cryptographic assumptions, the Cairo
> executable identified by the locally trusted program hash produced the exact
> declared public output from the exact declared public input.

It has not established:

- that a relay is honest, complete, available, or censorship-resistant in
  practice;
- that the provider is available, fairly priced, or operating specific
  hardware;
- that a provider timing metric is accurate;
- that a physical-world event happened;
- that the Cairo program expresses the user's intended policy;
- that private request data stayed private;
- that this research-alpha implementation has been independently audited.

## Trust anchors

The client still trusts:

- the reviewed Cairo source and `protocol/programs.json`;
- the application-controlled provider public-key allowlist for deciding whose
  success or error may settle a request;
- the STWO/Cairo verifier implementation and pinned dependencies;
- the build that produced the browser WASM;
- its own runtime, signer, and origin;
- the cryptographic assumptions of signatures, SHA-256, Blake2s, Poseidon, and
  the STARK construction.

The client need not trust an allowed provider's computation claim, relay event
ordering, artifact server contents, or descriptor claims. Those are
authenticated or verified. A compromised allowlisted provider key can still
return a terminal error or withhold service; proof verification does not solve
availability.

## Threats and controls

| Threat | Control |
|---|---|
| Forged request/result | Nostr event ID and Schnorr signature verification |
| Unselected signer races the provider | mandatory application provider allowlist, relay author filter, and callback author check |
| Ambiguous wire encoding | typed canonical JSON, unknown-field rejection, singleton tags, content/tag equality |
| Wrong service or request | kind/service/input binding and complete signed request in result |
| Provider proves another program | independent program hash manifest checked after STWO verification |
| Provider supplies weaker proof parameters | exact 96-bit PCS/FRI and canonical preprocessing profile checked before STWO verification |
| Mounted Cairo artifact differs from review | executable SHA-256 checked against the manifest at provider startup |
| Provider changes output | raw and typed public statement compared with the proven Cairo output |
| Artifact mutation | exact size plus SHA-256 before parsing or verification |
| Malicious proof faults verifier | pre-parse size cap; native panic containment; JS catches WASM errors/traps as rejection |
| Oversized or expensive request | request/field/depth/time bounds before proving intake |
| Duplicate relay delivery | bounded request-ID deduplication before proving |
| Prover blocks async relay loop | bounded semaphore plus blocking worker pool |
| Secret leaked from browser storage | no implicit persistent secret; NIP-07 or explicit caller-owned signer |
| Internal error disclosure | stable error codes and bounded sanitized public messages |
| Artifact overwrite | content-addressed create-once filesystem storage |
| Dependency drift | exact direct pins, committed locks, pinned toolchains/images, audit gates |

## Privacy

The Cairo ABI separates public input from private witness. The proof statement
for a hash check does not expose the preimage; the Merkle statement does not
expose siblings. That ABI separation is not a zero-knowledge guarantee. The
serialized proof has not been analyzed or audited for witness hiding.

Soul Wire v1 nevertheless sends those witnesses in cleartext in the signed
request. Every relay receiving the request can read them. Do not use secrets.
Encrypted request transport, proof-level witness-hiding analysis, and metadata
leakage analysis are prerequisites for any privacy claim.

NIP-07 keeps signing material in a browser extension, but the extension and
page origin remain security dependencies. An explicit local signer is intended
for controlled development and server applications; it is never persisted by
the SDK.

## Availability and resource risk

Proof generation is CPU- and memory-intensive. Bounds and immediate
concurrency rejection prevent easy unbounded fan-out, not economic denial of
service. Production operators need:

- OS/container CPU and memory limits;
- disk quotas and artifact retention policy;
- relay allow/deny and rate-limiting policy;
- TLS and reverse-proxy request limits;
- monitoring for busy responses, proof failures, and disk pressure;
- more than one artifact replica if result longevity matters.

The result event proves no future data availability. A client should fetch and
retain proofs it cares about.

## Dependency residuals

`cargo audit` reports no currently classified vulnerability that makes the
audit command fail, but the pinned upstream Cairo/STWO/Nostr graph carries
informational RustSec warnings:

- `RUSTSEC-2026-0002`: an `lru 0.12.5` `IterMut` soundness defect, pulled
  through `num-prime 0.4.4 → cairo-vm 3.2.0`; the patched `lru >=0.16.3` is
  outside the current upstream dependency constraint;
- unmaintained `bincode`, `derivative`, `instant`, and `paste` transitive
  packages.

Soul Society does not directly call the affected `lru::IterMut` API, but a
transitive absence of exploitation is not a proof of safety. These warnings are
another reason production use is out of scope. They should be removed through
tested upstream Cairo/STWO/Nostr releases, not hidden with audit ignores or an
untested dependency override.

## Program updates

A program hash change is a trust-root change, not a routine rebuild:

1. review Cairo source and dependency diff;
2. build with the pinned toolchain;
3. generate and self-verify the canonical fixture;
4. review the new program hash and executable SHA-256;
5. run native, WASM, mutation, protocol, and live-relay tests;
6. update the manifest in a clearly labeled change;
7. coordinate client/provider rollout.

Never learn the expected hash from the proof being verified at runtime.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use a private
[GitHub security advisory](https://github.com/AbdelStark/soulsociety/security/advisories/new)
with:

- affected commit or version;
- threat scenario and impact;
- minimal reproduction;
- whether keys, private data, or public infrastructure may be exposed;
- any proposed mitigation.

No bounty is promised. Good-faith reports will be handled with discretion and
credited when desired.
