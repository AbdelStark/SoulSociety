//! Generate the canonical, self-verified Fibonacci fixture and program manifest.
//!
//! Usage:
//! `cargo run -p soul-prover --bin soul-proof-fixture -- --out-dir DIR [--executable PATH]`
//!
//! The statement and program hash are deterministic properties of the pinned
//! Cairo executable. Proof JSON is an artifact, not a hand-maintained golden
//! string: regenerate it with the pinned toolchain, verify it, and compute the
//! descriptor SHA-256 over the bytes actually emitted.

use std::path::{Path, PathBuf};
use std::{env, fs};

use serde_json::json;
use sha2::{Digest, Sha256};
use soul_core::{
    JobInput, CAIRO_PROGRAM, PROOF_CHANNEL, PROOF_FORMAT, PROOF_MEDIA_TYPE, SOUL_WIRE_PROTOCOL,
};
use soul_prover::{verify_serialized, ProgramManifestGenerator};

fn main() {
    if let Err(error) = run() {
        eprintln!("fixture generation failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let (out_dir, executable) = parse_arguments()?;
    let executable = executable.unwrap_or_else(default_executable);
    let generator = ProgramManifestGenerator::new(&executable)?;
    let artifact = generator.prove_fixture(&JobInput::Fibonacci { n: 10 })?;

    // Repeat verification against the discovered hash before any file is
    // written. Runtime consumers subsequently pin this hash from manifest.json.
    verify_serialized(
        &artifact.proof_bytes,
        artifact.program_hash.as_str(),
        &artifact.statement,
    )?;

    fs::create_dir_all(&out_dir)?;
    let proof_sha256 = hex::encode(Sha256::digest(&artifact.proof_bytes));
    write(
        &out_dir.join("fibonacci-10.proof.json"),
        &artifact.proof_bytes,
    )?;
    write_json(
        &out_dir.join("fibonacci-10.statement.json"),
        &artifact.statement,
    )?;
    write_json(
        &out_dir.join("manifest.json"),
        &json!({
            "protocol": SOUL_WIRE_PROTOCOL,
            "program": CAIRO_PROGRAM,
            "program_hash": artifact.program_hash,
        }),
    )?;
    write_json(
        &out_dir.join("fibonacci-10.fixture.json"),
        &json!({
            "format": PROOF_FORMAT,
            "media_type": PROOF_MEDIA_TYPE,
            "channel": PROOF_CHANNEL,
            "proof_file": "fibonacci-10.proof.json",
            "sha256": proof_sha256,
            "byte_size": artifact.proof_bytes.len(),
            "statement_file": "fibonacci-10.statement.json",
            "program_hash": artifact.program_hash,
            "metrics": artifact.metrics,
        }),
    )?;

    println!(
        "verified fixture written to {} (program_hash={}, proof_sha256={proof_sha256})",
        out_dir.display(),
        artifact.program_hash,
    );
    Ok(())
}

fn parse_arguments() -> Result<(PathBuf, Option<PathBuf>), Box<dyn std::error::Error>> {
    let mut arguments = env::args_os().skip(1);
    let mut out_dir = None;
    let mut executable = None;
    while let Some(argument) = arguments.next() {
        match argument.to_str() {
            Some("--out-dir") => {
                out_dir = Some(arguments.next().ok_or("--out-dir requires a path")?.into());
            }
            Some("--executable") => {
                executable = Some(
                    arguments
                        .next()
                        .ok_or("--executable requires a path")?
                        .into(),
                );
            }
            Some("--help" | "-h") => {
                println!(
                    "Usage: soul-proof-fixture --out-dir DIR [--executable soul_cairo.executable.json]"
                );
                std::process::exit(0);
            }
            _ => return Err(format!("unknown argument: {}", argument.to_string_lossy()).into()),
        }
    }
    Ok((out_dir.ok_or("--out-dir is required")?, executable))
}

fn default_executable() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../soul-cairo/target/dev/soul_cairo.executable.json")
}

fn write(path: &Path, bytes: &[u8]) -> Result<(), std::io::Error> {
    fs::write(path, bytes)
}

fn write_json(
    path: &Path,
    value: &impl serde::Serialize,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write(path, &bytes)?;
    Ok(())
}
