//! Strict environment configuration for the provider process.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::{env, fs};

use anyhow::{bail, Context, Result};
use soul_core::FeltHex;
use url::{Host, Url};

const MODE: &str = "SOUL_PROVIDER_MODE";
const RELAYS: &str = "SOUL_PROVIDER_RELAYS";
const SECRET_KEY: &str = "SOUL_PROVIDER_SECRET_KEY";
const SECRET_KEY_FILE: &str = "SOUL_PROVIDER_SECRET_KEY_FILE";
const NAME: &str = "SOUL_PROVIDER_NAME";
const HTTP_ADDR: &str = "SOUL_PROVIDER_HTTP_ADDR";
const ARTIFACT_DIR: &str = "SOUL_PROVIDER_ARTIFACT_DIR";
const PUBLIC_BASE_URL: &str = "SOUL_PROVIDER_PUBLIC_BASE_URL";
const MAX_CONCURRENT_PROOFS: &str = "SOUL_PROVIDER_MAX_CONCURRENT_PROOFS";
const CAIRO_EXECUTABLE: &str = "SOUL_CAIRO_EXECUTABLE";
const CAIRO_PROGRAM_HASH: &str = "SOUL_CAIRO_PROGRAM_HASH";
const CAIRO_EXECUTABLE_SHA256: &str = "SOUL_CAIRO_EXECUTABLE_SHA256";

/// Runtime safety mode. Only explicit development/test modes permit an
/// ephemeral provider identity; every mode still requires a trusted Cairo
/// program hash.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderMode {
    Production,
    Development,
    Test,
}

impl ProviderMode {
    fn from_env() -> Result<Self> {
        match env::var(MODE)
            .unwrap_or_else(|_| "production".to_owned())
            .as_str()
        {
            "production" => Ok(Self::Production),
            "development" => Ok(Self::Development),
            "test" => Ok(Self::Test),
            value => bail!("{MODE} must be production, development, or test; got {value:?}"),
        }
    }

    #[must_use]
    pub const fn permits_ephemeral_identity(self) -> bool {
        matches!(self, Self::Development | Self::Test)
    }
}

/// Fully validated provider configuration.
#[derive(Debug, Clone)]
pub struct Config {
    pub mode: ProviderMode,
    pub relay_urls: Vec<String>,
    pub secret_key: Option<String>,
    pub name: String,
    pub http_addr: SocketAddr,
    pub artifact_dir: PathBuf,
    pub public_base_url: Url,
    pub max_concurrent_proofs: usize,
    pub cairo_executable: PathBuf,
    pub expected_program_hash: FeltHex,
    pub expected_executable_sha256: String,
}

impl Config {
    /// Read, normalize, and validate all provider environment variables.
    pub fn from_env() -> Result<Self> {
        let mode = ProviderMode::from_env()?;
        let is_production = mode == ProviderMode::Production;

        let relay_value = match env::var(RELAYS) {
            Ok(value) => value,
            Err(_) if !is_production => "ws://127.0.0.1:7000".to_owned(),
            Err(error) => return Err(error).context(format!("{RELAYS} is required in production")),
        };
        let relay_urls: Vec<String> = relay_value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| validate_relay_url(value, is_production))
            .collect::<Result<_>>()?;
        if relay_urls.is_empty() {
            bail!("{RELAYS} must contain at least one relay URL");
        }

        let secret_key = read_secret_key()?;
        if is_production && secret_key.is_none() {
            bail!("{SECRET_KEY} or {SECRET_KEY_FILE} is required in production");
        }

        let name = env::var(NAME).unwrap_or_else(|_| "soul-provider".to_owned());
        if name.is_empty() || name.len() > 64 || name.chars().any(char::is_control) {
            bail!("{NAME} must contain 1..=64 printable characters");
        }

        let http_addr = env::var(HTTP_ADDR)
            .unwrap_or_else(|_| "127.0.0.1:8081".to_owned())
            .parse()
            .with_context(|| format!("{HTTP_ADDR} must be a socket address"))?;
        let artifact_dir =
            PathBuf::from(env::var(ARTIFACT_DIR).unwrap_or_else(|_| "./var/proofs".to_owned()));

        let public_base_url = match env::var(PUBLIC_BASE_URL) {
            Ok(value) => validate_public_base_url(&value)?,
            Err(_) if !is_production => validate_public_base_url("http://127.0.0.1:8081")?,
            Err(error) => {
                return Err(error).context(format!("{PUBLIC_BASE_URL} is required in production"));
            }
        };
        if is_production && public_base_url.scheme() != "https" {
            bail!("{PUBLIC_BASE_URL} must use HTTPS in production");
        }

        let max_concurrent_proofs: usize = env::var(MAX_CONCURRENT_PROOFS)
            .unwrap_or_else(|_| "1".to_owned())
            .parse()
            .with_context(|| format!("{MAX_CONCURRENT_PROOFS} must be an integer"))?;
        if !(1..=16).contains(&max_concurrent_proofs) {
            bail!("{MAX_CONCURRENT_PROOFS} must be between 1 and 16");
        }

        let cairo_executable = match env::var(CAIRO_EXECUTABLE) {
            Ok(value) => PathBuf::from(value),
            Err(_) if !is_production => {
                PathBuf::from("crates/soul-cairo/target/dev/soul_cairo.executable.json")
            }
            Err(error) => {
                return Err(error).context(format!("{CAIRO_EXECUTABLE} is required in production"));
            }
        };

        let expected_program_hash = FeltHex::parse(
            env::var(CAIRO_PROGRAM_HASH)
                .with_context(|| format!("{CAIRO_PROGRAM_HASH} is always required"))?,
        )
        .with_context(|| format!("{CAIRO_PROGRAM_HASH} must be a canonical felt"))?;
        let expected_executable_sha256 = env::var(CAIRO_EXECUTABLE_SHA256)
            .with_context(|| format!("{CAIRO_EXECUTABLE_SHA256} is always required"))?;
        if expected_executable_sha256.len() != 64
            || !expected_executable_sha256
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            bail!("{CAIRO_EXECUTABLE_SHA256} must be 64 lowercase hexadecimal characters");
        }

        Ok(Self {
            mode,
            relay_urls,
            secret_key,
            name,
            http_addr,
            artifact_dir,
            public_base_url,
            max_concurrent_proofs,
            cairo_executable,
            expected_program_hash,
            expected_executable_sha256,
        })
    }
}

fn read_secret_key() -> Result<Option<String>> {
    let inline = env::var(SECRET_KEY).ok().filter(|value| !value.is_empty());
    let file = env::var(SECRET_KEY_FILE)
        .ok()
        .filter(|value| !value.is_empty());
    if inline.is_some() && file.is_some() {
        bail!("{SECRET_KEY} and {SECRET_KEY_FILE} are mutually exclusive");
    }
    let Some(path) = file else {
        return Ok(inline);
    };
    let path = PathBuf::from(path);
    let metadata = fs::metadata(&path)
        .with_context(|| format!("cannot inspect provider secret file {}", path.display()))?;
    if !metadata.is_file() || metadata.len() > 256 {
        bail!("provider secret file must be a regular file no larger than 256 bytes");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            bail!("provider secret file must not be accessible by group or other users");
        }
    }
    let value = fs::read_to_string(&path)
        .with_context(|| format!("cannot read provider secret file {}", path.display()))?;
    let value = value.strip_suffix('\n').unwrap_or(&value);
    let value = value.strip_suffix('\r').unwrap_or(value).to_owned();
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        bail!("provider secret file must contain exactly one unpadded secret");
    }
    Ok(Some(value))
}

fn validate_relay_url(value: &str, is_production: bool) -> Result<String> {
    let url = Url::parse(value).with_context(|| format!("invalid relay URL {value:?}"))?;
    if !matches!(url.scheme(), "ws" | "wss")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        bail!("relay URL must be ws(s), absolute, and contain no credentials or fragment");
    }
    if is_production && url.scheme() != "wss" {
        bail!("relay URLs must use WSS in production");
    }
    Ok(url.to_string())
}

fn validate_public_base_url(value: &str) -> Result<Url> {
    let mut url = Url::parse(value).context("invalid proof public base URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || (url.scheme() == "http" && !is_loopback_host(&url))
    {
        bail!(
            "proof public base URL must be HTTPS (or loopback HTTP), absolute, and contain no credentials/query"
        );
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

fn is_loopback_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}
