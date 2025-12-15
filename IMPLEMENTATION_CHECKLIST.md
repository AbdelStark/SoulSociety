# Soul Society MVP Implementation Checklist

> Track progress by checking off items as they're completed.

## Phase 0: Foundation (Week 1)

### Monorepo Setup
- [ ] Create workspace `Cargo.toml` with all crate members
- [ ] Create root `package.json` with pnpm workspaces
- [ ] Configure `turbo.json` for build orchestration
- [ ] Create `pnpm-workspace.yaml`
- [ ] Set up `rustfmt.toml` and `.prettierrc`
- [ ] Create `.gitignore` with appropriate patterns

### Directory Structure
- [ ] Create `apps/` directory
- [ ] Create `crates/` directory  
- [ ] Create `packages/` directory
- [ ] Create `infra/` directory
- [ ] Create `scripts/` directory
- [ ] Create `docs/` directory

### Docker & Infrastructure
- [ ] Create `infra/docker/Dockerfile.provider`
- [ ] Create `infra/docker/Dockerfile.web`
- [ ] Create `infra/docker/nginx.conf`
- [ ] Create `infra/docker-compose.yml`
- [ ] Test `docker compose up` works

### CI/CD
- [ ] Create `.github/workflows/ci.yml`
- [ ] Add Rust build & test job
- [ ] Add TypeScript build & test job
- [ ] Add WASM build job
- [ ] Add Docker build job

### Migrate Existing UI
- [ ] Move existing React code to `apps/web/`
- [ ] Update import paths
- [ ] Verify `pnpm dev` works
- [ ] Verify `pnpm build` works

### Documentation
- [ ] Create `docs/architecture.md`
- [ ] Create `docs/adding-new-service.md`
- [ ] Create `docs/deployment-guide.md`
- [ ] Update root `README.md`

---

## Phase 1: Core Infrastructure (Weeks 2-3)

### soul-core Crate
- [ ] Create `crates/soul-core/Cargo.toml`
- [ ] Implement `types.rs` (JobId, ServiceType, etc.)
- [ ] Implement `nostr_events.rs` (event parsing)
- [ ] Implement `constants.rs`
- [ ] Add unit tests
- [ ] Verify `cargo test -p soul-core` passes

### soul-prover Crate (Scaffold)
- [ ] Create `crates/soul-prover/Cargo.toml`
- [ ] Add STWO dependency
- [ ] Create prover interface trait
- [ ] Create verifier interface trait
- [ ] Add mock implementations for testing

### soul-cairo Crate (Scaffold)
- [ ] Create `crates/soul-cairo/Scarb.toml`
- [ ] Set up Cairo project structure
- [ ] Add test framework config

### Provider Application (Scaffold)
- [ ] Create `apps/provider/Cargo.toml`
- [ ] Implement `main.rs` with CLI args
- [ ] Implement config loading
- [ ] Implement basic Nostr subscription
- [ ] Implement event publishing
- [ ] Test with local relay

### TypeScript SDK (Scaffold)
- [ ] Create `packages/soul-sdk/package.json`
- [ ] Create `packages/soul-sdk/tsconfig.json`
- [ ] Implement Nostr client wrapper
- [ ] Implement job submission
- [ ] Implement result subscription
- [ ] Add TypeScript types

### Integration Testing
- [ ] Provider subscribes to events ✓
- [ ] Provider publishes events ✓
- [ ] SDK sends events ✓
- [ ] SDK receives events ✓
- [ ] Full round-trip works ✓

---

## Phase 2: Service Implementation (Weeks 4-6)

### Fibonacci Service

#### Cairo Program
- [ ] Write `crates/soul-cairo/src/fibonacci.cairo`
- [ ] Add unit tests
- [ ] Verify `scarb test` passes
- [ ] Generate execution trace

#### Provider Integration
- [ ] Implement `apps/provider/src/services/fibonacci.rs`
- [ ] Integrate Cairo execution
- [ ] Integrate STWO proving
- [ ] Add to service router
- [ ] Add integration tests

### Hash Verification Service

#### Cairo Program
- [ ] Write `crates/soul-cairo/src/hash_verifier.cairo`
- [ ] Implement Poseidon hash
- [ ] Add unit tests
- [ ] Verify `scarb test` passes

#### Provider Integration
- [ ] Implement `apps/provider/src/services/hash_verifier.rs`
- [ ] Add to service router
- [ ] Add integration tests

### Merkle Proof Service

#### Cairo Program
- [ ] Write `crates/soul-cairo/src/merkle_proof.cairo`
- [ ] Implement Merkle verification logic
- [ ] Add unit tests
- [ ] Verify `scarb test` passes

#### Provider Integration
- [ ] Implement `apps/provider/src/services/merkle_proof.rs`
- [ ] Add to service router
- [ ] Add integration tests

### WASM Verification

#### soul-wasm Crate
- [ ] Create `crates/soul-wasm/Cargo.toml`
- [ ] Add wasm-bindgen setup
- [ ] Implement `verify_proof` function
- [ ] Create `build.sh` script
- [ ] Verify `wasm-pack build` works

#### Web Integration
- [ ] Copy WASM to `apps/web/src/lib/verification/wasm/`
- [ ] Create TypeScript wrapper
- [ ] Integrate with verification modal
- [ ] Test in browser

### End-to-End Testing
- [ ] Fibonacci: submit → prove → verify ✓
- [ ] HashVerify: submit → prove → verify ✓
- [ ] MerkleProof: submit → prove → verify ✓
- [ ] All proofs verify in browser ✓

---

## Phase 3: Web UI Polish (Weeks 7-8)

### Nostr Integration

#### Client Implementation
- [ ] Implement `apps/web/src/lib/nostr/client.ts`
- [ ] Add NIP-07 wallet detection
- [ ] Implement key management (local storage fallback)
- [ ] Add relay connection management

#### State Management
- [ ] Implement `apps/web/src/stores/jobStore.ts`
- [ ] Implement `apps/web/src/stores/serviceStore.ts`
- [ ] Implement `apps/web/src/stores/walletStore.ts`
- [ ] Add persistence (localStorage)

### Components

#### Replace Mocks with Real Data
- [ ] ServiceGrid uses live service definitions
- [ ] JobsList subscribes to real events
- [ ] StatusIndicator reflects live status
- [ ] PricingInfo shows actual pricing

#### Service Forms
- [ ] FibonacciForm component
- [ ] HashVerifyForm component
- [ ] MerkleProofForm component
- [ ] Form validation

#### Verification Modal
- [ ] Step-by-step progress UI
- [ ] WASM verification integration
- [ ] Error handling display
- [ ] Proof details expansion

### UX Polish
- [ ] Loading skeletons
- [ ] Error boundaries
- [ ] Toast notifications
- [ ] Mobile responsive fixes
- [ ] Accessibility audit

### E2E Tests
- [ ] Write Playwright tests
- [ ] Job submission flow
- [ ] Verification flow
- [ ] Error scenarios

---

## Phase 4: Infrastructure & Deployment (Weeks 9-10)

### Cloud Infrastructure (GCP)

#### Terraform
- [ ] Create `infra/terraform/gcp/main.tf`
- [ ] Create `infra/terraform/gcp/variables.tf`
- [ ] Create `infra/terraform/gcp/outputs.tf`
- [ ] Test `terraform plan`
- [ ] Test `terraform apply` (staging)

#### Resources
- [ ] VPC Network configured
- [ ] Cloud Run for web frontend
- [ ] Compute Engine for provider
- [ ] Container Registry
- [ ] Firewall rules

### Cloud Infrastructure (AWS - Optional)

#### Terraform
- [ ] Create `infra/terraform/aws/main.tf`
- [ ] Create `infra/terraform/aws/variables.tf`
- [ ] Create `infra/terraform/aws/outputs.tf`

### Production Docker
- [ ] Create `infra/docker-compose.prod.yml`
- [ ] Multi-stage builds optimized
- [ ] Security hardening

### Monitoring
- [ ] Set up Prometheus metrics export
- [ ] Create Grafana dashboards
- [ ] Set up log aggregation
- [ ] Configure alerts

### Deployment
- [ ] Deploy to production
- [ ] SSL certificates
- [ ] DNS configuration
- [ ] Smoke tests

### Documentation
- [ ] Complete `docs/deployment-guide.md`
- [ ] Create runbook
- [ ] Document troubleshooting

---

## Definition of Done (MVP)

### Functionality
- [ ] 3 DVM services operational
- [ ] Proofs generated for all jobs
- [ ] Browser verification works
- [ ] Jobs visible in real-time

### Quality
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E tests pass
- [ ] No critical bugs

### Operations
- [ ] Production deployment live
- [ ] Monitoring active
- [ ] Documentation complete
- [ ] Team can deploy independently

### Performance
- [ ] Job completion rate > 99%
- [ ] Proof generation < 30s (p95)
- [ ] Verification < 2s (p95)
- [ ] UI loads < 3s

---

## Notes & Blockers

| Date | Note |
|------|------|
| | |

## Team Assignments

| Component | Owner | Status |
|-----------|-------|--------|
| soul-core | | Not started |
| soul-cairo | | Not started |
| soul-prover | | Not started |
| soul-wasm | | Not started |
| provider | | Not started |
| web | | In progress (mocked) |
| infrastructure | | Not started |
