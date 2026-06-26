use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use chrono::{DateTime, Duration, Utc};
use sha2::{Sha256, Digest};
use sqlx::Row;

use crate::error::AppError;

/// Maximum total session lifetime, regardless of activity.
/// After 7 days from `created_at`, the session is forced-expired
/// even if it has been actively sliding-refreshed.
pub const SESSION_HARD_CAP_DAYS: i64 = 7;

/// Idle timeout — sliding refresh bumps `expires_at` by this much
/// each time the session is used (and more than 1h has passed since
/// last touch).
pub const SESSION_IDLE_HOURS: i64 = 24;

/// Truncate IP to first 3 octets (IPv4) or first 4 hextets (IPv6).
/// Tolerates mobile network changes; still rejects attackers on a
/// different network.
pub fn ip_prefix(ip: &str) -> String {
    if ip.contains(':') {
        // IPv6 — take first 4 hextets (32 bits)
        ip.split(':').take(4).collect::<Vec<_>>().join(":")
    } else if ip.contains('.') {
        // IPv4 — take first 3 octets
        ip.split('.').take(3).collect::<Vec<_>>().join(".")
    } else {
        ip.chars().take(45).collect()
    }
}

/// Truncate User-Agent to first 64 chars for fingerprint comparison.
/// Tolerates browser version bumps; still binds to browser family.
pub fn ua_prefix(ua: &str) -> String {
    ua.chars().take(64).collect()
}

/// Validated session data extracted from the request.
/// Any handler parameter of this type triggers automatic session validation.
#[derive(Debug, Clone)]
pub struct AuthSession {
    pub user_id: uuid::Uuid,
    pub username: String,
    /// SHA-256 hash of the raw session token.
    /// Used to identify the current session in list/revoke operations.
    pub session_token_hash: String,
}

/// Hash a raw session token with SHA-256 to produce the DB lookup key.
/// We never store raw tokens — only their hashes.
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

/// Touch the session: bump `last_used_at`, and if more than 1h has
/// passed since the last touch, also push `expires_at` forward by
/// `SESSION_IDLE_HOURS`. Returns silently on error (fire-and-forget
/// from the request hot path — a missed touch just means the session
/// expires sooner, which is safe).
pub async fn touch_session(db: &sqlx::PgPool, token_hash: &str) {
    let now = Utc::now();
    let new_expiry = now + Duration::hours(SESSION_IDLE_HOURS);

    // Fire-and-forget: log warning but don't propagate.
    let result = sqlx::query(
        r#"
        UPDATE sessions
        SET last_used_at = $1,
            expires_at = CASE
                WHEN last_used_at < $1 - INTERVAL '1 hour'
                THEN $2
                ELSE expires_at
            END
        WHERE token_hash = $3
        "#,
    )
    .bind(now)
    .bind(new_expiry)
    .bind(token_hash)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::warn!("Failed to touch session: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_token_deterministic() {
        let token = "test-token-123";
        let h1 = hash_token(token);
        let h2 = hash_token(token);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_token_different_for_different_inputs() {
        let h1 = hash_token("token-a");
        let h2 = hash_token("token-b");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_hash_token_is_hex() {
        let hash = hash_token("anything");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hash_token_empty_string() {
        let hash = hash_token("");
        assert_eq!(hash.len(), 64);
    }

    #[test]
    fn ip_prefix_ipv4_first_three_octets() {
        assert_eq!(ip_prefix("192.168.1.42"), "192.168.1");
        assert_eq!(ip_prefix("10.0.0.1"), "10.0.0");
    }

    #[test]
    fn ip_prefix_ipv6_first_four_hextets() {
        assert_eq!(
            ip_prefix("2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
            "2001:0db8:85a3:0000"
        );
    }

    #[test]
    fn ua_prefix_truncates_at_64() {
        let long = "a".repeat(100);
        assert_eq!(ua_prefix(&long).len(), 64);
        assert_eq!(ua_prefix("short"), "short");
    }
}

#[axum::async_trait]
impl FromRequestParts<crate::AppState> for AuthSession {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &crate::AppState,
    ) -> Result<Self, Self::Rejection> {
        // 1. Extract the Bearer token from the Authorization header
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                AppError::Unauthorized("Missing Authorization header".to_string())
            })?;

        let raw_token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| {
                AppError::Unauthorized(
                    "Invalid Authorization format. Expected: Bearer <token>".to_string(),
                )
            })?;

        // 2. Hash the token and look up the session
        let token_hash = hash_token(raw_token);

        let row = sqlx::query(
            r#"
            SELECT s.user_id,
                   u.username,
                   s.created_at,
                   s.ip_prefix,
                   s.ua_prefix
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = $1
              AND s.expires_at > NOW()
            "#,
        )
        .bind(&token_hash)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Session lookup failed: {}", e)))?;

        let row = row.ok_or_else(|| {
            AppError::Unauthorized("Invalid or expired session".to_string())
        })?;

        let user_id: uuid::Uuid = row.get("user_id");
        let username: String = row.get("username");
        let created_at: Option<DateTime<Utc>> = row.get("created_at");
        let stored_ip_prefix: Option<String> = row.get("ip_prefix");
        let stored_ua_prefix: Option<String> = row.get("ua_prefix");

        // 3. Hard cap: even with sliding refresh, sessions expire 7d
        // after creation. This caps the damage if a token is stolen
        // and used continuously for a week.
        if let Some(created) = created_at {
            if Utc::now() - created > Duration::days(SESSION_HARD_CAP_DAYS) {
                return Err(AppError::Unauthorized(
                    "Session expired, please log in again".to_string(),
                ));
            }
        }

        // 4. Fingerprint check — reject if IP prefix or UA prefix
        // differs from what was captured at login. Tolerates mobile
        // IP changes within the same /24, blocks stolen tokens used
        // from a different device/network.
        if let Some(stored_ip) = stored_ip_prefix {
            if !stored_ip.is_empty() {
                let incoming_ip = parts
                    .headers
                    .get("x-forwarded-for")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.split(',').next())
                    .map(|s| s.trim().to_string());
                if let Some(ip) = incoming_ip {
                    if ip_prefix(&ip) != stored_ip {
                        return Err(AppError::Unauthorized(
                            "Session fingerprint mismatch".to_string(),
                        ));
                    }
                }
            }
        }

        if let Some(stored_ua) = stored_ua_prefix {
            if !stored_ua.is_empty() {
                let incoming_ua = parts
                    .headers
                    .get("user-agent")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                if let Some(ua) = incoming_ua {
                    if ua_prefix(&ua) != stored_ua {
                        return Err(AppError::Unauthorized(
                            "Session fingerprint mismatch".to_string(),
                        ));
                    }
                }
            }
        }

        // 5. Sliding touch — fire and forget. Keeps active sessions
        // alive without blocking the request.
        let db = state.db.clone();
        let token_hash_for_touch = token_hash.clone();
        tokio::spawn(async move {
            touch_session(&db, &token_hash_for_touch).await;
        });

        Ok(AuthSession {
            user_id,
            username,
            session_token_hash: token_hash,
        })
    }
}