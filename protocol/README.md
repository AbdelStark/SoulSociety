# Soul Wire

Soul Wire is Soul Society's small, application-specific protocol for requesting
and returning verifiable Cairo computations over Nostr.

It deliberately borrows the request/result shape and kind ranges explored by
NIP-90, but it is not presented as NIP-90 compliance. NIP-90 is a draft,
unrecommended specification whose own maintainers now recommend focused
use-case microstandards.

The normative protocol, validation rules, event examples, and compatibility
policy live in [docs/protocol.md](../docs/protocol.md). This directory contains
the machine-readable trust manifest and cross-language golden fixtures:

- `programs.json` pins the reviewed Cairo program identity accepted by native and
  browser verifiers.
- `fixtures/wire` contains deterministic, signed test-only Soul Wire events.
- `fixtures/generated` is ignored and contains a real STWO proof generated on
  demand.

Regenerate and verify all fixture data with:

```bash
./scripts/generate-test-data.sh
./scripts/generate-test-data.sh --check
```

The fixture secret keys are public test vectors. They must never be used for
identity, relay authorization, payments, or a real provider.
