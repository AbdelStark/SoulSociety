//! Soul Provider - DVM Service Provider for Soul Society
//!
//! This is the main entry point for the DVM provider application.
//! It subscribes to Nostr events, executes Cairo programs, and publishes results with proofs.

use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod nostr;
mod services;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("soul_provider=debug".parse()?)
                .add_directive("soul_core=debug".parse()?),
        )
        .init();

    info!("Starting Soul Society DVM Provider...");
    info!("Version: {}", env!("CARGO_PKG_VERSION"));

    // TODO: Load configuration
    // TODO: Initialize Nostr client
    // TODO: Start service handlers
    // TODO: Begin event subscription loop

    info!("Soul Provider initialized successfully");
    info!("Listening for DVM job requests...");

    // Keep the application running
    // In the full implementation, this will be replaced by the event loop
    tokio::signal::ctrl_c().await?;

    info!("Shutting down Soul Provider...");
    Ok(())
}
