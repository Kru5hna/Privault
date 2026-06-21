use axum::{
    extract::State,
    Json,
};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::RngCore;
use sqlx::Row;

use crate::error::AppError;
use crate::audit;
use crate::auth::session::{AuthSession, hash_token};
use super::models::*;

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recovery/store-key
// ─────────────────────────────────────────────────────────────────────────────
//
// Called by the client after registration. The client derives a KEK from
// the recovery phrase, wraps their RSA private key with AES-GCM, and stores
// it on the server. This allows recovery login to decrypt the key.
//
// This must happen within the same registration session (user must be
// authenticated) to prove ownership of the account.

pub async fn store_key(
    State(state): State<crate::AppState>,
    session: AuthSession,
    Json(payload): Json<StoreRecoveryKeyRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    if payload.recovery_wrapped_key.trim().is_empty() {
        return Err(AppError::BadRequest("Recovery wrapped key is required".to_string()));
    }
    if payload.recovery_wrapped_key_iv.trim().is_empty() {
        return Err(AppError::BadRequest("Recovery wrapped key IV is required".to_string()));
    }

    sqlx::query(
        r#"
        UPDATE users
        SET recovery_wrapped_key = $1, recovery_wrapped_key_iv = $2
        WHERE id = $3
        "#,
    )
    .bind(&payload.recovery_wrapped_key)
    .bind(&payload.recovery_wrapped_key_iv)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_RECOVERY_KEY_STORED,
        None,
        None,
        None,
        None,
    ).await;

    Ok(Json(MessageResponse {
        message: "Recovery key stored successfully".to_string(),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recovery/recover
// ─────────────────────────────────────────────────────────────────────────────
//
// Public endpoint (no session required). Client sends username + recovery
// phrase. Server:
//   1. Looks up user by recovery_phrase_hash (SHA-256 of phrase)
//   2. Verifies the derived auth verifier matches recovery_auth_hash
//   3. Creates a new session
//   4. Returns key material wrapped with the recovery KEK
//
// The client then derives the recovery KEK from the phrase, decrypts
// recovery_wrapped_key to get the RSA private key, and can proceed to
// set a new password.

pub async fn recover(
    State(state): State<crate::AppState>,
    Json(payload): Json<RecoverRequest>,
) -> Result<Json<RecoverResponse>, AppError> {
    if payload.username.trim().is_empty() {
        return Err(AppError::BadRequest("Username is required".to_string()));
    }
    if payload.recovery_phrase.trim().is_empty() {
        return Err(AppError::BadRequest("Recovery phrase is required".to_string()));
    }

    // Hash the phrase to look up the user
    let phrase_hash = super::hash_phrase(&payload.recovery_phrase);

    // Find user by recovery_phrase_hash
    let row = sqlx::query(
        r#"
        SELECT id, username, recovery_auth_hash, public_key,
               recovery_wrapped_key, recovery_wrapped_key_iv
        FROM users
        WHERE recovery_phrase_hash = $1
        "#,
    )
    .bind(&phrase_hash)
    .fetch_optional(&state.db)
    .await?;

    let row = row.ok_or_else(|| {
        AppError::BadRequest("Invalid recovery phrase or username".to_string())
    })?;

    // Verify the derived auth verifier matches the stored hash
    let derived_verifier = super::derive_recovery_auth_verifier(&payload.recovery_phrase);
    let stored_auth_hash: String = row.get("recovery_auth_hash");

    let parsed_hash = PasswordHash::new(&stored_auth_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Stored hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(derived_verifier.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::BadRequest("Invalid recovery phrase or username".to_string()))?;

    let user_id: uuid::Uuid = row.get("id");
    let username: String = row.get("username");

    // Create a new session
    let mut token_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut token_bytes);
    let session_token = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        token_bytes,
    );

    let token_hash_hex = hash_token(&session_token);
    let expires_at = chrono::Utc::now() + chrono::Duration::days(7);

    sqlx::query(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user_id)
    .bind(&token_hash_hex)
    .bind(expires_at)
    .fetch_optional(&state.db)
    .await?;

    let recovery_wrapped_key: Option<String> = row.get("recovery_wrapped_key");
    let recovery_wrapped_key_iv: Option<String> = row.get("recovery_wrapped_key_iv");
    let public_key: String = row.get("public_key");

    // If recovery_wrapped_key is missing, the client never stored it
    let recovery_wrapped_key = recovery_wrapped_key.ok_or_else(|| {
        AppError::BadRequest("No recovery key stored for this account. Registration may be incomplete.".to_string())
    })?;
    let recovery_wrapped_key_iv = recovery_wrapped_key_iv.unwrap_or_default();

    tracing::info!("Account recovered via phrase: {} ({})", username, user_id);

    audit::log_event(
        &state.db,
        user_id,
        audit::EVENT_RECOVERED,
        None,
        None,
        None,
        None,
    ).await;

    Ok(Json(RecoverResponse {
        message: "Recovery successful".to_string(),
        session_token,
        user_id: user_id.to_string(),
        username,
        recovery_wrapped_key,
        recovery_wrapped_key_iv,
        public_key,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recovery/change-password
// ─────────────────────────────────────────────────────────────────────────────
//
// Called after recovery login. Client derives new password KEK, re-wraps
// the RSA private key with it, generates new salts, and derives a new
// auth verifier. Server updates the user row.
//
// This also clears the recovery hashes (since the old phrase is no longer
// valid) and the recovery_wrapped_key. The client should call /api/auth/register
// or a dedicated endpoint to generate a NEW recovery phrase if desired.

pub async fn change_password(
    State(state): State<crate::AppState>,
    session: AuthSession,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    if payload.auth_verifier.trim().is_empty() {
        return Err(AppError::BadRequest("Auth verifier is required".to_string()));
    }
    if payload.auth_salt.trim().is_empty() || payload.kek_salt.trim().is_empty() {
        return Err(AppError::BadRequest("Salts are required".to_string()));
    }
    if payload.wrapped_private_key.trim().is_empty() {
        return Err(AppError::BadRequest("Wrapped private key is required".to_string()));
    }
    if payload.wrapped_private_key_iv.trim().is_empty() {
        return Err(AppError::BadRequest("Wrapped private key IV is required".to_string()));
    }

    // Hash the new auth_verifier with Argon2id
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut rand::rngs::OsRng);
    let auth_hash = argon2
        .hash_password(payload.auth_verifier.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Argon2 hash failed: {}", e)))?
        .to_string();

    // Update user: new password material, clear recovery fields
    sqlx::query(
        r#"
        UPDATE users
        SET auth_hash = $1,
            auth_salt = $2,
            kek_salt = $3,
            wrapped_private_key = $4,
            wrapped_private_key_iv = $5,
            recovery_auth_hash = NULL,
            recovery_phrase_hash = NULL,
            recovery_wrapped_key = NULL,
            recovery_wrapped_key_iv = NULL
        WHERE id = $6
        "#,
    )
    .bind(&auth_hash)
    .bind(&payload.auth_salt)
    .bind(&payload.kek_salt)
    .bind(&payload.wrapped_private_key)
    .bind(&payload.wrapped_private_key_iv)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    tracing::info!("Password changed after recovery: {} ({})",
        session.username, session.user_id);

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_PASSWORD_RESET,
        None,
        None,
        None,
        None,
    ).await;

    Ok(Json(MessageResponse {
        message: "Password changed successfully. Recovery phrase has been invalidated.".to_string(),
    }))
}
