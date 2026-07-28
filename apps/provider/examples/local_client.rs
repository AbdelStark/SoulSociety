//! Disposable local-relay Soul Wire smoke client.
//!
//! It creates an ephemeral requester identity, publishes Fibonacci(10), waits
//! for a result bound through the `e` tag, validates the result signature and
//! full request binding, then prints the canonical result JSON.

use std::time::Duration;

use anyhow::{bail, Context, Result};
use nostr_sdk::prelude::*;
use soul_core::{
    into_nostr_tags, parse_request_event, parse_result_event, request_tags, JobInput,
    JobRequestContent, JobResultContent,
};

#[tokio::main]
async fn main() -> Result<()> {
    let relay =
        std::env::var("SOUL_E2E_RELAY").unwrap_or_else(|_| "ws://127.0.0.1:7000".to_owned());
    let timeout_seconds: u64 = std::env::var("SOUL_E2E_TIMEOUT_SECS")
        .unwrap_or_else(|_| "180".to_owned())
        .parse()
        .context("SOUL_E2E_TIMEOUT_SECS must be an integer")?;
    let expected_provider = std::env::var("SOUL_E2E_PROVIDER_PUBKEY")
        .ok()
        .map(|value| PublicKey::parse(&value).context("invalid SOUL_E2E_PROVIDER_PUBKEY"))
        .transpose()?;

    let keys = Keys::generate();
    let client = Client::new(keys.clone());
    let mut notifications = client.notifications();
    client
        .add_relay(&relay)
        .await
        .with_context(|| format!("failed to add relay {relay}"))?;
    client.connect().await;
    client.wait_for_connection(Duration::from_secs(15)).await;
    if !client
        .relays()
        .await
        .values()
        .any(|relay| relay.is_connected())
    {
        bail!("relay did not connect within 15 seconds");
    }

    let now = Timestamp::now().as_secs();
    let content = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(now + 300));
    let content_json = content.canonical_json()?;
    let event = EventBuilder::new(Kind::from(content.service.request_kind()), content_json)
        .tags(into_nostr_tags(request_tags(&content, None)?)?)
        .sign_with_keys(&keys)?;
    let request = parse_request_event(&event, now)?;
    let mut filter = Filter::new()
        .kind(Kind::from(content.service.result_kind()))
        .event(event.id);
    if let Some(provider) = expected_provider {
        filter = filter.author(provider);
    }
    let subscription = client.subscribe(filter, None).await?;
    if subscription.success.is_empty() {
        bail!(
            "no relay accepted the result subscription: {:?}",
            subscription.failed
        );
    }
    let publication = client.send_event(&event).await?;
    if publication.success.is_empty() {
        bail!(
            "no relay accepted the request event: {:?}",
            publication.failed
        );
    }

    let result_event = tokio::time::timeout(Duration::from_secs(timeout_seconds), async {
        loop {
            match notifications.recv().await? {
                RelayPoolNotification::Event { event, .. }
                    if event.kind.as_u16() == request.service.result_kind() =>
                {
                    if expected_provider.is_some_and(|provider| event.pubkey != provider) {
                        continue;
                    }
                    break Ok::<Event, anyhow::Error>(*event);
                }
                RelayPoolNotification::Shutdown => bail!("relay pool shut down"),
                _ => {}
            }
        }
    })
    .await
    .context("timed out waiting for a Soul Wire result")??;

    let result = parse_result_event(&result_event, &request, Timestamp::now().as_secs())?;
    println!("{}", serde_json::to_string(&result)?);
    client.shutdown().await;

    if matches!(result, JobResultContent::Error { .. }) {
        bail!("provider returned an error result");
    }
    Ok(())
}
