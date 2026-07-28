//! Opt-in real Cairo/STWO integration seam.
//!
//! Run after building the Cairo executable:
//!
//! ```text
//! SOUL_TEST_CAIRO_EXECUTABLE=... \
//! SOUL_TEST_CAIRO_PROGRAM_HASH=0x... \
//! SOUL_TEST_CAIRO_EXECUTABLE_SHA256=... \
//! cargo test -p soul-provider --test signed_real_pipeline -- --ignored --nocapture
//! ```

use std::sync::Arc;

use nostr::{EventBuilder, Keys, Kind, Timestamp};
use soul_core::{
    into_nostr_tags, parse_request_event, parse_result_event, request_tags, FeltHex, JobInput,
    JobRequestContent, JobResultContent,
};
use soul_prover::VerifiableJobEngine;
use soul_provider::artifacts::{MemoryProofArtifactStore, ProofArtifactStore};
use soul_provider::nostr::SignedJobHandler;
use soul_provider::processor::ProofProcessor;
use url::Url;

const TEST_ONLY_CUSTOMER_SECRET: &str =
    "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ONLY_PROVIDER_SECRET: &str =
    "0000000000000000000000000000000000000000000000000000000000000002";

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires a built Cairo executable and reviewed SOUL_TEST_CAIRO_PROGRAM_HASH"]
async fn signed_request_to_real_proof_artifact_and_signed_result_is_idempotent() {
    let executable = std::env::var("SOUL_TEST_CAIRO_EXECUTABLE")
        .expect("set SOUL_TEST_CAIRO_EXECUTABLE to the Scarb executable JSON");
    let program_hash = FeltHex::parse(
        std::env::var("SOUL_TEST_CAIRO_PROGRAM_HASH")
            .expect("set SOUL_TEST_CAIRO_PROGRAM_HASH to the reviewed canonical felt"),
    )
    .expect("SOUL_TEST_CAIRO_PROGRAM_HASH must be a canonical felt");
    let executable_sha256 = std::env::var("SOUL_TEST_CAIRO_EXECUTABLE_SHA256")
        .expect("set SOUL_TEST_CAIRO_EXECUTABLE_SHA256 from the reviewed manifest");
    let engine = VerifiableJobEngine::new(executable, program_hash, &executable_sha256)
        .expect("initialize real engine");
    let store = Arc::new(MemoryProofArtifactStore::default());
    let processor = Arc::new(ProofProcessor::new(
        Arc::new(engine),
        store.clone(),
        Url::parse("https://proofs.test/").unwrap(),
        1,
    ));
    let handler = SignedJobHandler::new(
        Keys::parse(TEST_ONLY_PROVIDER_SECRET).unwrap(),
        processor,
        16,
    );

    let now = Timestamp::now().as_secs();
    let content = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(now + 600));
    let content_json = content.canonical_json().unwrap();
    let request_event = EventBuilder::new(Kind::from(content.service.request_kind()), content_json)
        .tags(into_nostr_tags(request_tags(&content, None).unwrap()).unwrap())
        .custom_created_at(Timestamp::from_secs(now))
        .sign_with_keys(&Keys::parse(TEST_ONLY_CUSTOMER_SECRET).unwrap())
        .unwrap();
    let request = parse_request_event(&request_event, now + 1).unwrap();

    let result_event = handler
        .handle_event(&request_event, now + 1)
        .await
        .expect("handle signed request")
        .expect("first delivery returns one result");
    let result = parse_result_event(&result_event, &request, now + 1).expect("bind signed result");
    let JobResultContent::Success {
        proof, statement, ..
    } = result
    else {
        panic!("real engine must yield a successful result");
    };
    assert_eq!(statement.service, content.service);
    assert!(store
        .get(&proof.sha256)
        .await
        .expect("artifact store read")
        .is_some());

    let replay = handler
        .handle_event(&request_event, now + 1)
        .await
        .expect("duplicate handling")
        .expect("completed duplicate replays the cached signed result");
    assert_eq!(
        replay.id, result_event.id,
        "duplicate delivery must not generate a second proof or signature"
    );
}
