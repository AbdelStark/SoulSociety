//! Generate deterministic, disposable Soul Wire protocol fixtures.
//!
//! The two fixed secret keys below are public test data. They are intentionally
//! trivial and MUST NEVER be used for funds, identity, relay access, or any
//! production/development provider.

use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

use nostr::prelude::rand::rngs::StdRng;
use nostr::prelude::rand::SeedableRng;
use nostr::{Event, EventBuilder, JsonUtil, Keys, Kind, Timestamp, SECP256K1};
use serde::Serialize;
use serde_json::json;
use soul_core::{
    into_nostr_tags, parse_request_event, request_tags, result_tags, FeltHex, JobInput, JobMetrics,
    JobOutput, JobRequestContent, JobResultContent, ProofDescriptor, ProofStatement, ServiceType,
    CAIRO_PROGRAM, PROOF_CHANNEL, PROOF_FORMAT, PROOF_MEDIA_TYPE,
};

const TEST_ONLY_CUSTOMER_SECRET: &str =
    "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ONLY_PROVIDER_SECRET: &str =
    "0000000000000000000000000000000000000000000000000000000000000002";
const CREATED_AT: u64 = 1_900_000_000;
const PROOF_FIXTURE: &[u8] = br#"{"proof":"test-only-fixture"}"#;
const PROOF_SHA256: &str = "5d23ce867fb5c3e2f3346e090e5a7dd4f1d5e088735b9b968f0812c4f350504e";

fn main() -> Result<(), Box<dyn Error>> {
    let output = output_directory()?;
    fs::create_dir_all(&output)?;

    let customer = Keys::parse(TEST_ONLY_CUSTOMER_SECRET)?;
    let provider = Keys::parse(TEST_ONLY_PROVIDER_SECRET)?;
    let request_content =
        JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(CREATED_AT + 600));
    let request_content_json = request_content.canonical_json()?;
    let request_tag_values = request_tags(&request_content, Some(21))?;
    let request_event = sign_deterministically(
        EventBuilder::new(
            Kind::from(request_content.service.request_kind()),
            request_content_json.clone(),
        )
        .tags(into_nostr_tags(request_tag_values.clone())?)
        .custom_created_at(Timestamp::from_secs(CREATED_AT)),
        &customer,
        1,
    )?;
    let request = parse_request_event(&request_event, CREATED_AT + 1)?;

    let result_content = JobResultContent::success(
        request.id.clone(),
        ProofStatement {
            service: ServiceType::Fibonacci,
            program: CAIRO_PROGRAM.to_owned(),
            public_input: vec![FeltHex::from_u64(10)],
            public_output: vec![FeltHex::from_u64(55)],
            output: JobOutput::Fibonacci {
                result: FeltHex::from_u64(55),
            },
        },
        ProofDescriptor {
            format: PROOF_FORMAT.to_owned(),
            media_type: PROOF_MEDIA_TYPE.to_owned(),
            url: format!("https://proofs.example/v1/proofs/{PROOF_SHA256}.json"),
            sha256: PROOF_SHA256.to_owned(),
            byte_size: PROOF_FIXTURE.len() as u64,
            program_hash: FeltHex::from_u64(9),
            channel: PROOF_CHANNEL.to_owned(),
        },
        JobMetrics {
            execution_ms: 1,
            proving_ms: 2,
            verification_ms: 3,
        },
    );
    let result_content_json = serde_json::to_string(&result_content)?;
    let result_tag_values = result_tags(&request, &result_content);
    let result_event = sign_deterministically(
        EventBuilder::new(
            Kind::from(request.service.result_kind()),
            result_content_json.clone(),
        )
        .tags(into_nostr_tags(result_tag_values.clone())?)
        .custom_created_at(Timestamp::from_secs(CREATED_AT + 2)),
        &provider,
        2,
    )?;

    write(&output, "request-content.json", &request_content)?;
    write(&output, "request-tags.json", &request_tag_values)?;
    write_json_string(&output, "request-event.json", &request_event.try_as_json()?)?;
    write(&output, "result-content.json", &result_content)?;
    write(&output, "result-tags.json", &result_tag_values)?;
    write_json_string(&output, "result-event.json", &result_event.try_as_json()?)?;
    fs::write(output.join(format!("{PROOF_SHA256}.json")), PROOF_FIXTURE)?;
    write(
        &output,
        "fixture-manifest.json",
        &json!({
            "warning": "PUBLIC TEST-ONLY KEYS. NEVER USE FOR IDENTITY, FUNDS, OR A REAL PROVIDER.",
            "created_at": CREATED_AT,
            "customer_test_only_secret_key_hex": TEST_ONLY_CUSTOMER_SECRET,
            "customer_public_key": customer.public_key().to_string(),
            "provider_test_only_secret_key_hex": TEST_ONLY_PROVIDER_SECRET,
            "provider_public_key": provider.public_key().to_string(),
            "proof_sha256": PROOF_SHA256,
        }),
    )?;
    Ok(())
}

fn output_directory() -> Result<PathBuf, Box<dyn Error>> {
    let mut arguments = std::env::args_os().skip(1);
    let output = arguments
        .next()
        .ok_or("usage: cargo run -p soul-core --example generate_fixtures -- <output-dir>")?;
    if arguments.next().is_some() {
        return Err("expected exactly one output directory".into());
    }
    Ok(PathBuf::from(output))
}

fn sign_deterministically(
    builder: EventBuilder,
    keys: &Keys,
    seed: u64,
) -> Result<Event, nostr::event::Error> {
    let mut rng = StdRng::seed_from_u64(seed);
    builder
        .build(keys.public_key())
        .sign_with_ctx(SECP256K1, &mut rng, keys)
}

fn write<T: Serialize>(directory: &Path, name: &str, value: &T) -> Result<(), Box<dyn Error>> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    fs::write(directory.join(name), bytes)?;
    Ok(())
}

fn write_json_string(directory: &Path, name: &str, json: &str) -> Result<(), Box<dyn Error>> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    write(directory, name, &value)
}
