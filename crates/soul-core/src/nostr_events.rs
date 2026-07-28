//! Signed Nostr event codec for the Soul Wire application protocol.
//!
//! The tag shape intentionally resembles data-vending events, but Soul Wire is
//! an application-specific microstandard and does not claim NIP-90 compliance.

use nostr::{Event, JsonUtil, Tag};
use thiserror::Error;

use crate::constants::{limits, SOUL_WIRE_PROTOCOL};
use crate::types::{
    ErrorCode, JobRequest, JobRequestContent, JobResultContent, ServiceType, ValidationError,
};

const INPUT_TYPE: &str = "text";
const TOPIC: &str = "soul-society";

/// Parse and authenticate a Soul Wire request.
pub fn parse_request_event(event: &Event, now: u64) -> Result<JobRequest, WireError> {
    event.verify().map_err(|_| WireError::InvalidEvent)?;

    let kind = event.kind.as_u16();
    if !ServiceType::is_request_kind(kind) {
        return Err(WireError::UnsupportedKind);
    }
    let service = ServiceType::from_kind(kind).ok_or(WireError::UnsupportedKind)?;

    if event.content.len() > limits::MAX_REQUEST_BYTES {
        return Err(WireError::RequestTooLarge);
    }

    let created_at = event.created_at.as_secs();
    if created_at > now.saturating_add(limits::MAX_FUTURE_SKEW_SECS)
        || now.saturating_sub(created_at) > limits::MAX_REQUEST_AGE_SECS
    {
        return Err(WireError::InvalidTimestamp);
    }

    let content: JobRequestContent =
        serde_json::from_str(&event.content).map_err(|_| WireError::MalformedJson)?;
    content.validate(created_at, now)?;
    if content.service != service {
        return Err(WireError::ServiceKindMismatch);
    }

    let canonical_input = content
        .canonical_json()
        .map_err(|_| WireError::MalformedJson)?;
    if canonical_input != event.content {
        return Err(WireError::NonCanonicalJson);
    }

    let bid_msats = optional_scalar_tag(event, "bid")?
        .map(|value| value.parse::<u64>().map_err(|_| WireError::InvalidTag))
        .transpose()?;
    if bid_msats.is_some_and(|value| value > limits::MAX_SAFE_INTEGER) {
        return Err(WireError::InvalidTag);
    }
    if event_tag_values(event) != request_tags(&content, bid_msats)? {
        return Err(WireError::InvalidTag);
    }

    let serialized_event = event.try_as_json().map_err(|_| WireError::MalformedJson)?;

    Ok(JobRequest {
        id: event.id.to_string(),
        service,
        input: content.input,
        bid_msats: bid_msats.unwrap_or_default(),
        customer_pubkey: event.pubkey.to_string(),
        created_at,
        expires_at: content.expires_at,
        canonical_input,
        serialized_event,
    })
}

/// Build canonical request tags. The caller still owns event signing.
pub fn request_tags(
    content: &JobRequestContent,
    bid_msats: Option<u64>,
) -> Result<Vec<Vec<String>>, WireError> {
    if bid_msats.is_some_and(|value| value > limits::MAX_SAFE_INTEGER) {
        return Err(WireError::InvalidTag);
    }
    let input = content
        .canonical_json()
        .map_err(|_| WireError::MalformedJson)?;
    let mut tags = vec![
        strings(["i", input.as_str(), INPUT_TYPE]),
        strings(["protocol", SOUL_WIRE_PROTOCOL]),
        strings(["service", content.service.as_str()]),
        strings(["t", TOPIC]),
    ];
    if let Some(expires_at) = content.expires_at {
        tags.push(vec!["expiration".to_owned(), expires_at.to_string()]);
    }
    if let Some(bid_msats) = bid_msats {
        tags.push(vec!["bid".to_owned(), bid_msats.to_string()]);
    }
    Ok(tags)
}

/// Build canonical result tags, including a complete copy of the signed
/// request event so a verifier can bind the response without relay state.
#[must_use]
pub fn result_tags(request: &JobRequest, result: &JobResultContent) -> Vec<Vec<String>> {
    vec![
        vec!["request".to_owned(), request.serialized_event.clone()],
        strings(["e", request.id.as_str()]),
        strings(["p", request.customer_pubkey.as_str()]),
        strings(["i", request.canonical_input.as_str(), INPUT_TYPE]),
        strings(["status", result.status()]),
        strings(["protocol", SOUL_WIRE_PROTOCOL]),
        strings(["service", request.service.as_str()]),
        strings(["t", TOPIC]),
    ]
}

/// Authenticate a result and prove that its kind, content, and tags all bind to
/// the same original request.
pub fn parse_result_event(
    event: &Event,
    request: &JobRequest,
    now: u64,
) -> Result<JobResultContent, WireError> {
    event.verify().map_err(|_| WireError::InvalidEvent)?;
    if event.kind.as_u16() != request.service.result_kind() {
        return Err(WireError::ServiceKindMismatch);
    }
    if event.content.len() > limits::MAX_RESULT_BYTES {
        return Err(WireError::ResultTooLarge);
    }
    let created_at = event.created_at.as_secs();
    if created_at < request.created_at
        || created_at > now.saturating_add(limits::MAX_FUTURE_SKEW_SECS)
    {
        return Err(WireError::InvalidTimestamp);
    }

    let result: JobResultContent =
        serde_json::from_str(&event.content).map_err(|_| WireError::MalformedJson)?;
    result.validate()?;
    if result.request_id() != request.id {
        return Err(WireError::RequestBindingMismatch);
    }
    if let JobResultContent::Success { statement, .. } = &result {
        if statement.service != request.service {
            return Err(WireError::ServiceKindMismatch);
        }
    }

    let canonical = serde_json::to_string(&result).map_err(|_| WireError::MalformedJson)?;
    if canonical != event.content {
        return Err(WireError::NonCanonicalJson);
    }

    let actual_tags = event_tag_values(event);
    if actual_tags.len() != 8 || actual_tags[0].len() != 2 || actual_tags[0][0] != "request" {
        return Err(WireError::InvalidTag);
    }
    let embedded_serialized = actual_tags[0][1].clone();
    let embedded_request = parse_embedded_request_event(&embedded_serialized)?;
    let expected_request =
        Event::from_json(&request.serialized_event).map_err(|_| WireError::MalformedJson)?;
    expected_request
        .verify()
        .map_err(|_| WireError::InvalidEvent)?;
    if embedded_request != expected_request {
        return Err(WireError::RequestBindingMismatch);
    }

    let mut expected_tags = result_tags(request, &result);
    expected_tags[0][1] = embedded_serialized;
    if actual_tags != expected_tags {
        return Err(WireError::InvalidTag);
    }

    Ok(result)
}

/// Parse raw tag arrays into Nostr tags without panics.
pub fn into_nostr_tags(tags: Vec<Vec<String>>) -> Result<Vec<Tag>, WireError> {
    tags.into_iter()
        .map(|tag| Tag::parse(tag).map_err(|_| WireError::InvalidTag))
        .collect()
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}

fn event_tag_values(event: &Event) -> Vec<Vec<String>> {
    event
        .tags
        .iter()
        .map(|tag| tag.as_slice().to_vec())
        .collect()
}

fn parse_embedded_request_event(serialized: &str) -> Result<Event, WireError> {
    const EVENT_KEYS: [&str; 7] = [
        "id",
        "pubkey",
        "created_at",
        "kind",
        "tags",
        "content",
        "sig",
    ];

    let value: serde_json::Value =
        serde_json::from_str(serialized).map_err(|_| WireError::MalformedJson)?;
    let serde_json::Value::Object(object) = value else {
        return Err(WireError::MalformedJson);
    };
    if object.len() != EVENT_KEYS.len() || EVENT_KEYS.iter().any(|key| !object.contains_key(*key)) {
        return Err(WireError::MalformedJson);
    }

    let event: Event = serde_json::from_value(serde_json::Value::Object(object))
        .map_err(|_| WireError::MalformedJson)?;
    event.verify().map_err(|_| WireError::InvalidEvent)?;
    Ok(event)
}

fn optional_scalar_tag<'a>(event: &'a Event, key: &str) -> Result<Option<&'a str>, WireError> {
    let matches: Vec<&[String]> = event
        .tags
        .iter()
        .filter_map(|tag| {
            let values = tag.as_slice();
            (values.first().map(String::as_str) == Some(key)).then_some(values)
        })
        .collect();
    match matches.as_slice() {
        [] => Ok(None),
        [values] if values.len() == 2 => Ok(Some(values[1].as_str())),
        [_] => Err(WireError::InvalidTag),
        _ => Err(WireError::DuplicateTag),
    }
}

/// Wire-level failures suitable for internal logs. Only [`WireError::public_code`]
/// should be exposed to relay clients.
#[derive(Debug, Error)]
pub enum WireError {
    #[error("event id or signature is invalid")]
    InvalidEvent,
    #[error("event kind is not a Soul Wire request/result kind")]
    UnsupportedKind,
    #[error("event timestamp is outside the accepted window")]
    InvalidTimestamp,
    #[error("request content exceeds the maximum size")]
    RequestTooLarge,
    #[error("result content exceeds the maximum size")]
    ResultTooLarge,
    #[error("content is not valid Soul Wire JSON")]
    MalformedJson,
    #[error("content is valid but not in canonical JSON form")]
    NonCanonicalJson,
    #[error("required tag is missing")]
    MissingTag,
    #[error("a singleton tag occurs more than once")]
    DuplicateTag,
    #[error("tag shape or value is invalid")]
    InvalidTag,
    #[error("event kind does not match the declared service")]
    ServiceKindMismatch,
    #[error("result is not bound to the original request")]
    RequestBindingMismatch,
    #[error(transparent)]
    Validation(#[from] ValidationError),
}

impl WireError {
    /// Stable public error code. This intentionally discards diagnostic detail.
    #[must_use]
    pub const fn public_code(&self) -> ErrorCode {
        match self {
            Self::UnsupportedKind | Self::ServiceKindMismatch => ErrorCode::UnsupportedService,
            Self::Validation(ValidationError::Expired) => ErrorCode::Expired,
            _ => ErrorCode::InvalidRequest,
        }
    }
}

#[cfg(test)]
mod tests {
    use nostr::{EventBuilder, Keys, Kind, Tag, Timestamp};

    use super::*;
    use crate::constants::{CAIRO_PROGRAM, PROOF_CHANNEL, PROOF_FORMAT, PROOF_MEDIA_TYPE};
    use crate::types::{FeltHex, JobMetrics, JobOutput, ProofDescriptor, ProofStatement};

    fn signed_request(now: u64) -> Event {
        let keys = Keys::generate();
        let content = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(now + 60));
        let content_json = content.canonical_json().unwrap();
        let tags = into_nostr_tags(request_tags(&content, Some(21)).unwrap()).unwrap();
        EventBuilder::new(Kind::from(content.service.request_kind()), content_json)
            .tags(tags)
            .custom_created_at(Timestamp::from(now))
            .sign_with_keys(&keys)
            .unwrap()
    }

    use crate::types::JobInput;

    #[test]
    fn signed_request_round_trips_and_binds_i_tag() {
        let event = signed_request(1_000);
        let request = parse_request_event(&event, 1_001).unwrap();
        assert_eq!(request.service, ServiceType::Fibonacci);
        assert_eq!(request.bid_msats, 21);
        assert!(matches!(
            request_tags(
                &JobRequestContent::new(JobInput::Fibonacci { n: 10 }, None),
                Some(limits::MAX_SAFE_INTEGER + 1),
            ),
            Err(WireError::InvalidTag)
        ));

        let keys = Keys::generate();
        let content = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(1_060));
        let content_json = content.canonical_json().unwrap();
        let tags = [
            Tag::parse(["i", "{}", "text"]).unwrap(),
            Tag::parse(["protocol", SOUL_WIRE_PROTOCOL]).unwrap(),
            Tag::parse(["service", "fibonacci"]).unwrap(),
            Tag::parse(["t", TOPIC]).unwrap(),
            Tag::parse(["expiration", "1060"]).unwrap(),
        ];
        let wrong_tag_event = EventBuilder::new(Kind::from(5601_u16), content_json.clone())
            .tags(tags)
            .custom_created_at(Timestamp::from(1_000))
            .sign_with_keys(&keys)
            .unwrap();
        assert!(matches!(
            parse_request_event(&wrong_tag_event, 1_001),
            Err(WireError::InvalidTag)
        ));

        let mut reordered = request_tags(&content, None).unwrap();
        reordered.swap(0, 1);
        let reordered_event = EventBuilder::new(Kind::from(5601_u16), content_json)
            .tags(into_nostr_tags(reordered).unwrap())
            .custom_created_at(Timestamp::from(1_000))
            .sign_with_keys(&keys)
            .unwrap();
        assert!(matches!(
            parse_request_event(&reordered_event, 1_001),
            Err(WireError::InvalidTag)
        ));
    }

    #[test]
    fn malformed_and_stale_requests_are_rejected() {
        let event = signed_request(1_000);
        assert!(matches!(
            parse_request_event(&event, 2_000),
            Err(WireError::InvalidTimestamp)
        ));

        let keys = Keys::generate();
        let tags = [Tag::parse(["i", "{}", "text"]).unwrap()];
        let malformed = EventBuilder::new(Kind::from(5601_u16), "{}")
            .tags(tags)
            .custom_created_at(Timestamp::from(1_000))
            .sign_with_keys(&keys)
            .unwrap();
        assert!(matches!(
            parse_request_event(&malformed, 1_001),
            Err(WireError::MalformedJson)
        ));
    }

    #[test]
    fn result_event_is_bound_to_signed_request() {
        let request_event = signed_request(1_000);
        let request = parse_request_event(&request_event, 1_001).unwrap();
        let result = JobResultContent::success(
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
                url: "https://proofs.example/v1/proofs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json".to_owned(),
                sha256: "a".repeat(64),
                byte_size: 123,
                program_hash: FeltHex::from_u64(9),
                channel: PROOF_CHANNEL.to_owned(),
            },
            JobMetrics {
                execution_ms: 1,
                proving_ms: 2,
                verification_ms: 3,
            },
        );
        let content = serde_json::to_string(&result).unwrap();
        let tags = into_nostr_tags(result_tags(&request, &result)).unwrap();
        let provider = Keys::generate();
        let event = EventBuilder::new(Kind::from(request.service.result_kind()), content)
            .tags(tags)
            .custom_created_at(Timestamp::from(1_002))
            .sign_with_keys(&provider)
            .unwrap();

        assert_eq!(parse_result_event(&event, &request, 1_002).unwrap(), result);

        let original: serde_json::Value = serde_json::from_str(&request.serialized_event).unwrap();
        let reordered_request = format!(
            "{{\"sig\":{},\"content\":{},\"tags\":{},\"kind\":{},\"created_at\":{},\"pubkey\":{},\"id\":{}}}",
            original["sig"],
            original["content"],
            original["tags"],
            original["kind"],
            original["created_at"],
            original["pubkey"],
            original["id"],
        );
        assert_ne!(reordered_request, request.serialized_event);
        let mut reordered_tags = result_tags(&request, &result);
        reordered_tags[0][1] = reordered_request;
        let reordered_event = EventBuilder::new(
            Kind::from(request.service.result_kind()),
            serde_json::to_string(&result).unwrap(),
        )
        .tags(into_nostr_tags(reordered_tags).unwrap())
        .custom_created_at(Timestamp::from(1_002))
        .sign_with_keys(&provider)
        .unwrap();
        assert_eq!(
            parse_result_event(&reordered_event, &request, 1_002).unwrap(),
            result
        );

        let mut extra_field = original;
        extra_field
            .as_object_mut()
            .unwrap()
            .insert("extra".to_owned(), serde_json::Value::Bool(true));
        assert!(matches!(
            parse_embedded_request_event(&serde_json::to_string(&extra_field).unwrap()),
            Err(WireError::MalformedJson)
        ));
    }
}
