# Changelog

All notable changes to `@soul-society/sdk` are documented here.

## 0.1.0 — unreleased

Research-alpha release candidate.

- Defines the canonical Soul Wire v1 request, result, statement, proof descriptor, and error schemas.
- Adds strict signed-event validation, service bounds, duplicate-resistant result subscriptions, and request-to-statement binding.
- Adds NIP-07, explicit secret-key, and ephemeral in-memory signer adapters without implicit key persistence.
- Adds a cancellable job lifecycle with bounded publish, result, and proof-fetch retries.
- Requires an explicit provider public-key allowlist before any signed success or error can settle a job.
- Streams HTTPS-first proof artifacts to signed size limits, validates media type and SHA-256, and invokes an injected local STWO verifier only after those checks.
- Documents the evidence boundary: no zero-knowledge, witness-hiding, transport-privacy, payment, availability, or production-readiness claim.
