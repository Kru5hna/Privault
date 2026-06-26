use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

/// Log an audit event. All handlers call this at key action points.
/// Returns the event ID, or logs and swallows errors (non-blocking).
pub async fn log_event(
    db: &PgPool,
    user_id: Uuid,
    event_type: &str,
    resource_type: Option<&str>,
    resource_id: Option<Uuid>,
    details: Option<serde_json::Value>,
    ip_address: Option<&str>,
) {
    let result = sqlx::query(
        r#"
        INSERT INTO audit_logs (user_id, event_type, resource_type, resource_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6::inet)
        "#,
    )
    .bind(user_id)
    .bind(event_type)
    .bind(resource_type)
    .bind(resource_id)
    .bind(details)
    .bind(ip_address)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::warn!("Failed to write audit log: {}", e);
    }
}

/// Helper to build detail JSON for common events.
pub fn detail<K, V>(pairs: impl IntoIterator<Item = (K, V)>) -> serde_json::Value
where
    K: Into<String>,
    V: Serialize,
{
    let mut map = serde_json::Map::new();
    for (k, v) in pairs {
        if let Ok(val) = serde_json::to_value(v) {
            map.insert(k.into(), val);
        }
    }
    serde_json::Value::Object(map)
}

/// Event type constants
pub const EVENT_UPLOAD: &str = "upload";
pub const EVENT_DOWNLOAD: &str = "download";
pub const EVENT_PREVIEW: &str = "preview";
pub const EVENT_SHARE_CREATED: &str = "share_created";
pub const EVENT_SHARE_REVOKED: &str = "share_revoked";
pub const EVENT_DELETED: &str = "deleted";
pub const EVENT_RESTORED: &str = "restored";
pub const EVENT_LOGIN: &str = "login";
pub const EVENT_LOGOUT: &str = "logout";
pub const EVENT_TRASH_EMPTIED: &str = "trash_emptied";
pub const EVENT_PERMANENT_DELETED: &str = "permanent_deleted";
pub const EVENT_RECOVERY_PHRASE_GENERATED: &str = "recovery_phrase_generated";
pub const EVENT_RECOVERY_KEY_STORED: &str = "recovery_key_stored";
pub const EVENT_RECOVERED: &str = "recovered";
pub const EVENT_PASSWORD_RESET: &str = "password_reset";
pub const EVENT_PASSWORD_CHANGED: &str = "password_changed";
pub const EVENT_ACCOUNT_DELETED: &str = "account_deleted";

/// Resource type constants
pub const RESOURCE_DOCUMENT: &str = "document";
pub const RESOURCE_FOLDER: &str = "folder";
pub const RESOURCE_SHARE_LINK: &str = "share_link";
pub const RESOURCE_SESSION: &str = "session";
