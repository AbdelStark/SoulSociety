//! Soul Society provider process.

use std::future::IntoFuture;
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use nostr_sdk::prelude::Keys;
use soul_prover::VerifiableJobEngine;
use soul_provider::artifacts::{artifact_router, FileProofArtifactStore, ProofArtifactStore};
use soul_provider::config::Config;
use soul_provider::nostr::NostrEventHandler;
use soul_provider::processor::ProofProcessor;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing()?;
    run().await
}

async fn run() -> Result<()> {
    let config = Config::from_env()?;
    let keys = match &config.secret_key {
        Some(secret_key) => Keys::parse(secret_key).context("invalid provider secret key")?,
        None if config.mode.permits_ephemeral_identity() => {
            warn!("using an ephemeral provider identity in explicit non-production mode");
            Keys::generate()
        }
        None => bail!("provider secret key is required"),
    };

    let store: Arc<dyn ProofArtifactStore> =
        Arc::new(FileProofArtifactStore::new(&config.artifact_dir).await?);
    let engine = VerifiableJobEngine::new(
        &config.cairo_executable,
        config.expected_program_hash.clone(),
        &config.expected_executable_sha256,
    )
    .context("failed to initialize the trusted Cairo/STWO engine")?;
    let processor = Arc::new(ProofProcessor::new(
        Arc::new(engine),
        Arc::clone(&store),
        config.public_base_url.clone(),
        config.max_concurrent_proofs,
    ));
    let handler = Arc::new(
        NostrEventHandler::new(keys, &config.relay_urls, processor)
            .await
            .context("failed to initialize Nostr transport")?,
    );

    let listener = TcpListener::bind(config.http_addr)
        .await
        .with_context(|| format!("failed to bind proof HTTP service at {}", config.http_addr))?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let http = axum::serve(listener, artifact_router(store))
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .into_future();

    info!(
        name = config.name,
        public_key = %handler.public_key(),
        http_addr = %config.http_addr,
        mode = ?config.mode,
        "Soul Society provider ready"
    );

    let event_loop = Arc::clone(&handler).start();
    tokio::pin!(event_loop);
    tokio::pin!(http);

    let outcome = tokio::select! {
        signal = tokio::signal::ctrl_c() => {
            signal.context("failed to install shutdown signal handler")?;
            Ok(())
        }
        result = &mut event_loop => {
            result?;
            bail!("Nostr event loop terminated unexpectedly")
        }
        result = &mut http => {
            result.context("proof HTTP service terminated")?;
            bail!("proof HTTP service terminated unexpectedly")
        }
    };

    let _ = shutdown_tx.send(());
    handler.shutdown().await;
    outcome
}

fn init_tracing() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        EnvFilter::new("info,soul_provider=debug,soul_core=debug,soul_prover=info")
    });
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .try_init()
        .map_err(|error| anyhow::anyhow!("failed to initialize tracing: {error}"))
}
