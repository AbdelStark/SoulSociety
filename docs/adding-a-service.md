# Adding a verifiable service

A service is a protocol and trust-root change, not just a new UI form.

## Design the statement first

Write down:

- the public claim a client needs;
- the private witness needed to establish it;
- all semantic and resource bounds;
- the canonical field encoding;
- the typed output;
- what a valid proof still does not establish.

If secret input must cross Nostr, encrypted transport must be designed before
calling the service private.

## Implementation sequence

1. **Allocate kinds.** Add a request kind in the Soul Wire 5xxx range and its
   result at `request + 1000`. Document the application-specific allocation.
2. **Extend core types.** Add the Rust and TypeScript service/input/output
   variants with matching snake_case JSON and strict unknown-field rejection.
3. **Add bounds.** Reject malformed or expensive input before bounded proving
   intake.
4. **Implement Cairo.** Add the computation behind the single executable
   dispatcher. Return only service ID, public input, and public output.
5. **Extend the statement adapter.** Encode Cairo arguments and decode the
   exact output ABI in `soul-prover`. Do not compute the production result in
   Rust.
6. **Bind verification.** Make native and WASM validation reject wrong arity,
   wrong typed output, wrong raw output, wrong program hash, and wrong proof.
7. **Extend Soul Wire.** Bind kind, service, input, statement, output, and
   result tags.
8. **Regenerate fixtures.** Add Rust/TypeScript golden data and a small real
   proof vector where practical.
9. **Add negative tests.** At minimum: boundary values, malformed fields,
   oversized witness, changed public input, changed output, changed program
   hash, changed proof bytes, duplicate request, and timeout/cancellation.
10. **Add the client surface.** The SDK owns the lifecycle. The web app should
    compose the SDK rather than duplicate protocol logic.
11. **Document the claim.** Update protocol, security model, and limitations
    before advertising the service.

## Review questions

- Can two wire encodings mean the same thing?
- Can an index, length, or field truncate between TypeScript, Rust, and Cairo?
- Does the public output reveal the witness?
- Can a provider substitute another program or request?
- Does false represent a valid proven result or a proving error?
- Can relay redelivery repeat expensive work?
- Can a proof URL cause an unsafe client request?
- What persists after provider restart?

Run the full suite:

```bash
./scripts/generate-test-data.sh
SOUL_RUN_LIVE_E2E=1 ./scripts/check.sh
```
