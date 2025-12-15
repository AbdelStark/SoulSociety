//! Soul Provider - DVM Service Provider for Soul Society
//!
//! This is the main entry point for the DVM provider application.
//! It subscribes to Nostr events, executes Cairo programs, and publishes results with proofs.

use anyhow::Result;
use nostr_sdk::prelude::*;
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod nostr;
mod services;

use config::Config;
use nostr::NostrEventHandler;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("soul_provider=debug".parse()?)
                .add_directive("soul_core=debug".parse()?),
        )
        .init();

    info!("Starting Soul Society DVM Provider...");
    info!("Version: {}", env!("CARGO_PKG_VERSION"));

    // Load configuration
    let config = Config::from_env()?;
    info!("Loaded configuration: name={}", config.name);
    info!("Relay URLs: {:?}", config.relay_urls);

    // Generate or load keys
    let keys = if config.secret_key.is_empty() {
        info!("No secret key provided, generating new keypair");
        Keys::generate()
    } else {
        info!("Using provided secret key");
        Keys::parse(&config.secret_key)?
    };

    info!("Provider public key: {}", keys.public_key());

    // Initialize the Nostr event handler
    let handler = NostrEventHandler::new(keys, config.relay_urls).await?;

    info!("Soul Provider initialized successfully");
    info!("Listening for DVM job requests...");
    info!("Supported services:");
    info!("  - Fibonacci (kind 5601)");
    info!("  - Hash Verification (kind 5602)");
    info!("  - Merkle Proof (kind 5603)");

    // Start the event handling loop
    // This runs until interrupted
    if let Err(e) = handler.start().await {
        error!("Event handler error: {}", e);
    }

    info!("Shutting down Soul Provider...");
    Ok(())
}
