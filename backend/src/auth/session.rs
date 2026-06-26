use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use sha2::{Sha256, Digest};
use sqlx::Row;

use crate::error::AppError;

// ─────────────────────────────────────────────────────────────────────────────
// Session Extractor — The Rust/Axum equivalent of Express auth middleware
// ─────────────────────────────────────────────────────────────────────────────
//
// By implementing `FromRequestParts` for `AuthSession`, any handler that takes
// `session: AuthSession` as a parameter will automatically require a valid session.
//
// How it works:
//   1. Read "Authorization: Bearer <token>" from the request header
//   2. SHA-256 hash the raw token
//   3. Look up the hash in the `sessions` table
//   4. Check that `expires_at > NOW()`
//   5. Return the user_id + username, or reject with 401
//
// Express equivalent:
//   function authMiddleware(req, res, next) {
//       const token = req.headers.authorization?.split(' ')[1];
//       const hash = sha256(token);
//       const session = await db.query('SELECT ... WHERE token_hash = $1 AND expires_at > NOW()', [hash]);
//       if (!session) return res.status(401).json({ error: 'Unauthorized' });
//       req.user = session;
//       next();
//   }

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
            SELECT s.user_id, u.username
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

        match row {
            Some(row) => Ok(AuthSession {
                user_id: row.get("user_id"),
                username: row.get("username"),
                session_token_hash: token_hash,
            }),
            None => Err(AppError::Unauthorized(
                "Invalid or expired session".to_string(),
            )),
        }
    }
}
