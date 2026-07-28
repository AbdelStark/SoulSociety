# soul-wasm

Verifier-only WebAssembly bindings for Soul Society's
`stwo-cairo-json-v1` proof artifacts.

The exported `WasmVerifier.verifyProof` method accepts proof bytes, an
independently trusted Cairo program hash, and the exact expected public
statement. It returns success only after STWO verification and both bindings
match.

This crate does not include the Cairo VM or prover, discover a trust root from
the proof, claim zero-knowledge, or authenticate Nostr events. Those
responsibilities remain with the SDK and reviewed `protocol/programs.json`.

Build through the pinned repository script:

```bash
./scripts/build-wasm.sh
```

The generated package is an internal web artifact during research alpha.
