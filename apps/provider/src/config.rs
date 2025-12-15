//! Configuration management for Soul Provider
//!
//! TODO: Implement configuration loading from environment and CLI

/// Provider configuration
pub struct Config {
    /// Nostr relay URLs
    pub relay_urls: Vec<String>,
    /// Provider secret key (hex encoded)
    pub secret_key: String,
    /// Provider name for identification
    pub name: String,
}

impl Config {
    /// Load configuration from environment variables
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            relay_urls: std::env::var("NOSTR_RELAYS")
                .unwrap_or_else(|_| "ws://localhost:8080".to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .collect(),
            secret_key: std::env::var("PROVIDER_SECRET_KEY")
                .unwrap_or_else(|_| String::new()),
            name: std::env::var("PROVIDER_NAME")
                .unwrap_or_else(|_| "soul-provider".to_string()),
        })
    }
}
