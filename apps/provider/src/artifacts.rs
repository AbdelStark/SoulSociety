//! Content-addressed proof storage and immutable browser delivery.

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use axum::body::Body;
use axum::extract::{Path as AxumPath, State};
use axum::http::header::{
    ACCESS_CONTROL_EXPOSE_HEADERS, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, ETAG,
    X_CONTENT_TYPE_OPTIONS,
};
use axum::http::{HeaderValue, Method, Response, StatusCode};
use axum::routing::get;
use axum::{Json, Router};
use bytes::Bytes;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use soul_core::constants::{limits, PROOF_MEDIA_TYPE, SOUL_WIRE_PROTOCOL};
use thiserror::Error;
use tokio::io::AsyncWriteExt;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Metadata returned after an artifact is durably stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredArtifact {
    pub sha256: String,
    pub byte_size: u64,
}

/// Deep seam between proof production and artifact persistence.
#[async_trait]
pub trait ProofArtifactStore: Send + Sync {
    /// Store bytes by digest. Repeating the same bytes is idempotent.
    async fn put(&self, proof: Bytes) -> Result<StoredArtifact, ArtifactError>;

    /// Read a digest-addressed artifact. Invalid keys return `None`.
    async fn get(&self, sha256: &str) -> Result<Option<Bytes>, ArtifactError>;
}

/// Filesystem-backed immutable artifact store.
pub struct FileProofArtifactStore {
    directory: PathBuf,
}

impl FileProofArtifactStore {
    /// Create the configured artifact directory.
    pub async fn new(directory: impl Into<PathBuf>) -> Result<Self, ArtifactError> {
        let directory = directory.into();
        tokio::fs::create_dir_all(&directory).await?;
        Ok(Self { directory })
    }

    fn artifact_path(&self, sha256: &str) -> PathBuf {
        self.directory.join(format!("{sha256}.json"))
    }

    fn temporary_path(&self, sha256: &str) -> PathBuf {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        self.directory
            .join(format!(".{sha256}.{}.{}.tmp", std::process::id(), sequence))
    }
}

#[async_trait]
impl ProofArtifactStore for FileProofArtifactStore {
    async fn put(&self, proof: Bytes) -> Result<StoredArtifact, ArtifactError> {
        validate_proof_size(proof.len())?;
        let sha256 = sha256_hex(&proof);
        let byte_size = proof.len() as u64;
        let final_path = self.artifact_path(&sha256);

        if let Some(existing) = self.get(&sha256).await? {
            if existing != proof {
                return Err(ArtifactError::DigestCollisionOrCorruption);
            }
            return Ok(StoredArtifact { sha256, byte_size });
        }

        let temporary_path = self.temporary_path(&sha256);
        let write_result = async {
            let mut file = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)
                .await?;
            file.write_all(&proof).await?;
            file.sync_all().await?;

            match tokio::fs::hard_link(&temporary_path, &final_path).await {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                    let existing = self
                        .get(&sha256)
                        .await?
                        .ok_or(ArtifactError::DigestCollisionOrCorruption)?;
                    if existing == proof {
                        Ok(())
                    } else {
                        Err(ArtifactError::DigestCollisionOrCorruption)
                    }
                }
                Err(error) => Err(error.into()),
            }
        }
        .await;
        let _ = tokio::fs::remove_file(&temporary_path).await;
        write_result?;

        Ok(StoredArtifact { sha256, byte_size })
    }

    async fn get(&self, sha256: &str) -> Result<Option<Bytes>, ArtifactError> {
        if !is_sha256(sha256) {
            return Ok(None);
        }
        let path = self.artifact_path(sha256);
        let metadata = match tokio::fs::symlink_metadata(&path).await {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() == 0
            || metadata.len() > limits::MAX_PROOF_BYTES
        {
            return Err(ArtifactError::DigestCollisionOrCorruption);
        }
        match tokio::fs::read(path).await {
            Ok(bytes) => {
                validate_proof_size(bytes.len())?;
                if sha256_hex(&bytes) != sha256 {
                    return Err(ArtifactError::DigestCollisionOrCorruption);
                }
                Ok(Some(Bytes::from(bytes)))
            }
            Err(error) => Err(error.into()),
        }
    }
}

/// In-memory adapter for deterministic tests and embedded development.
#[derive(Default)]
pub struct MemoryProofArtifactStore {
    artifacts: RwLock<HashMap<String, Bytes>>,
}

#[async_trait]
impl ProofArtifactStore for MemoryProofArtifactStore {
    async fn put(&self, proof: Bytes) -> Result<StoredArtifact, ArtifactError> {
        validate_proof_size(proof.len())?;
        let sha256 = sha256_hex(&proof);
        let byte_size = proof.len() as u64;
        let mut artifacts = self.artifacts.write().await;
        match artifacts.get(&sha256) {
            Some(existing) if existing != &proof => {
                return Err(ArtifactError::DigestCollisionOrCorruption);
            }
            Some(_) => {}
            None => {
                artifacts.insert(sha256.clone(), proof);
            }
        }
        Ok(StoredArtifact { sha256, byte_size })
    }

    async fn get(&self, sha256: &str) -> Result<Option<Bytes>, ArtifactError> {
        if !is_sha256(sha256) {
            return Ok(None);
        }
        Ok(self.artifacts.read().await.get(sha256).cloned())
    }
}

/// Build the public proof and health HTTP application.
pub fn artifact_router(store: Arc<dyn ProofArtifactStore>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::HEAD])
        .max_age(Duration::from_secs(86_400));

    Router::new()
        .route("/healthz", get(health))
        .route(
            "/v1/proofs/{artifact}",
            get(get_artifact).head(head_artifact),
        )
        .layer(cors)
        .with_state(store)
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "protocol": SOUL_WIRE_PROTOCOL,
    }))
}

async fn get_artifact(
    State(store): State<Arc<dyn ProofArtifactStore>>,
    AxumPath(artifact): AxumPath<String>,
) -> Response<Body> {
    let Some(sha256) = artifact.strip_suffix(".json") else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    match store.get(sha256).await {
        Ok(Some(bytes)) => immutable_response(sha256, bytes, false),
        Ok(None) => empty_response(StatusCode::NOT_FOUND),
        Err(_) => empty_response(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

async fn head_artifact(
    State(store): State<Arc<dyn ProofArtifactStore>>,
    AxumPath(artifact): AxumPath<String>,
) -> Response<Body> {
    let Some(sha256) = artifact.strip_suffix(".json") else {
        return empty_response(StatusCode::NOT_FOUND);
    };
    match store.get(sha256).await {
        Ok(Some(bytes)) => immutable_response(sha256, bytes, true),
        Ok(None) => empty_response(StatusCode::NOT_FOUND),
        Err(_) => empty_response(StatusCode::INTERNAL_SERVER_ERROR),
    }
}

fn immutable_response(sha256: &str, bytes: Bytes, head_only: bool) -> Response<Body> {
    let length = bytes.len();
    let body = if head_only {
        Body::empty()
    } else {
        Body::from(bytes)
    };
    let mut response = Response::new(body);
    *response.status_mut() = StatusCode::OK;
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static(PROOF_MEDIA_TYPE));
    headers.insert(
        CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(
        ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("content-length, etag"),
    );
    if let Ok(value) = HeaderValue::from_str(&length.to_string()) {
        headers.insert(CONTENT_LENGTH, value);
    }
    if let Ok(value) = HeaderValue::from_str(&format!("\"{sha256}\"")) {
        headers.insert(ETAG, value);
    }
    response
}

fn empty_response(status: StatusCode) -> Response<Body> {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = status;
    response
}

fn validate_proof_size(length: usize) -> Result<(), ArtifactError> {
    if length == 0 || length as u64 > limits::MAX_PROOF_BYTES {
        return Err(ArtifactError::InvalidSize);
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Artifact failures kept out of public relay messages.
#[derive(Debug, Error)]
pub enum ArtifactError {
    #[error("proof artifact must be nonempty and within the configured bound")]
    InvalidSize,
    #[error("proof digest collision or stored artifact corruption")]
    DigestCollisionOrCorruption,
    #[error("proof artifact I/O failed")]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use axum::body::to_bytes;
    use axum::http::{header, Request};
    use tower::ServiceExt;

    use super::*;

    #[tokio::test]
    async fn memory_and_file_stores_are_content_addressed_and_idempotent() {
        let proof = Bytes::from_static(br#"{"proof":"fixture"}"#);
        let memory = MemoryProofArtifactStore::default();
        let first = memory.put(proof.clone()).await.unwrap();
        let second = memory.put(proof.clone()).await.unwrap();
        assert_eq!(first, second);
        assert_eq!(
            memory.get(&first.sha256).await.unwrap(),
            Some(proof.clone())
        );

        let directory = tempfile::tempdir().unwrap();
        let filesystem = FileProofArtifactStore::new(directory.path()).await.unwrap();
        let stored = filesystem.put(proof.clone()).await.unwrap();
        assert_eq!(stored, first);
        assert_eq!(filesystem.get(&stored.sha256).await.unwrap(), Some(proof));
    }

    #[tokio::test]
    async fn http_serves_hash_bound_proofs_with_restrictive_public_cors() {
        let store = Arc::new(MemoryProofArtifactStore::default());
        let proof = Bytes::from_static(br#"{"proof":"fixture"}"#);
        let stored = store.put(proof.clone()).await.unwrap();
        let app = artifact_router(store);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/v1/proofs/{}.json", stored.sha256))
                    .header(header::ORIGIN, "https://client.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE).unwrap(),
            PROOF_MEDIA_TYPE
        );
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "*"
        );
        assert_eq!(
            to_bytes(response.into_body(), limits::MAX_PROOF_BYTES as usize)
                .await
                .unwrap(),
            proof
        );

        let traversal = app
            .oneshot(
                Request::builder()
                    .uri("/v1/proofs/not-a-digest.json")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(traversal.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn artifact_paths_never_use_remote_path_material() {
        let store = FileProofArtifactStore {
            directory: Path::new("/tmp/soul-proof-test").to_owned(),
        };
        let digest = "a".repeat(64);
        assert_eq!(
            store.artifact_path(&digest),
            Path::new("/tmp/soul-proof-test").join(format!("{digest}.json"))
        );
    }
}
