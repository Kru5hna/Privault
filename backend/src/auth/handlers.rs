use axum::{
    extract::{Path, State},
    Json,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::RngCore;
use sqlx::Row;

use crate::error::AppError;
use crate::audit;
use super::models::*;
use super::session::{AuthSession, hash_token};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<crate::AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, AppError> {
    // Validate required fields
    if payload.username.trim().is_empty() {
        return Err(AppError::BadRequest("Username is required".to_string()));
    }
    if payload.auth_verifier.trim().is_empty() {
        return Err(AppError::BadRequest("Auth verifier is required".to_string()));
    }
    if payload.auth_salt.trim().is_empty() || payload.kek_salt.trim().is_empty() {
        return Err(AppError::BadRequest("Salts are required".to_string()));
    }
    if payload.public_key.trim().is_empty() || payload.wrapped_private_key.trim().is_empty() {
        return Err(AppError::BadRequest("Key material is required".to_string()));
    }
    if payload.wrapped_private_key_iv.trim().is_empty() {
        return Err(AppError::BadRequest("Wrapped key IV is required".to_string()));
    }

    // Check for duplicate username (return 409 Conflict, not 400)
    let existing = sqlx::query("SELECT id FROM users WHERE username = $1")
        .bind(&payload.username)
        .fetch_optional(&state.db)
        .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Username already taken".to_string()));
    }

    // Hash the client's auth_verifier with Argon2id before storing.
    // Even if the DB leaks, the attacker cannot submit the raw verifier.
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut OsRng);
    let auth_hash = argon2
        .hash_password(payload.auth_verifier.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Argon2 hash failed: {}", e)))?
        .to_string();

    // Generate recovery phrase and store hashes
    let recovery_words = crate::recovery::generate_phrase();
    let recovery_phrase = crate::recovery::phrase_to_string(&recovery_words);
    let phrase_hash = crate::recovery::hash_phrase(&recovery_phrase);
    let recovery_auth_verifier = crate::recovery::derive_recovery_auth_verifier(&recovery_phrase);
    let recovery_auth_hash = crate::recovery::hash_recovery_auth_verifier(&recovery_auth_verifier)?;

    // Insert the new user
    let row = sqlx::query(
        r#"
        INSERT INTO users (username, auth_hash, auth_salt, kek_salt, public_key,
                           wrapped_private_key, wrapped_private_key_iv,
                           recovery_phrase_hash, recovery_auth_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
        "#,
    )
    .bind(&payload.username)
    .bind(&auth_hash)
    .bind(&payload.auth_salt)
    .bind(&payload.kek_salt)
    .bind(&payload.public_key)
    .bind(&payload.wrapped_private_key)
    .bind(&payload.wrapped_private_key_iv)
    .bind(&phrase_hash)
    .bind(&recovery_auth_hash)
    .fetch_one(&state.db)
    .await?;

    let user_id: uuid::Uuid = row.get("id");
    tracing::info!("New user registered: {} ({})", payload.username, user_id);

    audit::log_event(
        &state.db,
        user_id,
        audit::EVENT_RECOVERY_PHRASE_GENERATED,
        None,
        None,
        None,
        None,
    ).await;

    Ok(Json(RegisterResponse {
        id: user_id.to_string(),
        message: "User registered successfully".to_string(),
        recovery_phrase: Some(recovery_phrase),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<crate::AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // Validate input
    if payload.username.trim().is_empty() || payload.auth_verifier.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Username and auth verifier are required".to_string(),
        ));
    }

    // Find the user — use a single query to get everything we need
    let row = sqlx::query(
        r#"
        SELECT id, username, auth_hash, kek_salt, public_key, wrapped_private_key, wrapped_private_key_iv
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(&payload.username)
    .fetch_optional(&state.db)
    .await?;

    // Generic error message prevents username enumeration
    let row = row.ok_or_else(|| {
        AppError::BadRequest("Invalid username or password".to_string())
    })?;

    // Verify the auth_verifier against the stored Argon2id hash
    let stored_hash: String = row.get("auth_hash");
    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Stored hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(payload.auth_verifier.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::BadRequest("Invalid username or password".to_string()))?;

    // Generate a cryptographically random session token (32 bytes → base64)
    let mut token_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut token_bytes);
    let session_token = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        token_bytes,
    );

    // Store SHA-256 hash of the token in sessions table (7-day expiry)
    let token_hash_hex = hash_token(&session_token);
    let user_id: uuid::Uuid = row.get("id");
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

    let username: String = row.get("username");
    tracing::info!("User logged in: {} ({})", username, user_id);

    audit::log_event(
        &state.db,
        user_id,
        audit::EVENT_LOGIN,
        Some(audit::RESOURCE_SESSION),
        None,
        None,
        None,
    ).await;

    Ok(Json(LoginResponse {
        message: "Login successful".to_string(),
        session_token,
        user_id: user_id.to_string(),
        username,
        wrapped_private_key: row.get("wrapped_private_key"),
        wrapped_private_key_iv: row.get("wrapped_private_key_iv"),
        public_key: row.get("public_key"),
        kek_salt: row.get("kek_salt"),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

pub async fn logout(
    State(state): State<crate::AppState>,
    session: AuthSession,
) -> Result<Json<MessageResponse>, AppError> {
    // Delete ALL sessions for this user (full logout from all devices)
    // If you want single-session logout, delete by token_hash instead.
    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    tracing::info!("User logged out: {} ({})", session.username, session.user_id);

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_LOGOUT,
        Some(audit::RESOURCE_SESSION),
        None,
        None,
        None,
    ).await;

    Ok(Json(MessageResponse {
        message: "Logged out successfully".to_string(),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/salt/:username
// ─────────────────────────────────────────────────────────────────────────────
//
// Public endpoint — the client needs the salts BEFORE it can derive the
// auth_verifier to send with the login request.
//
// Security note: This does leak whether a username exists. If username
// enumeration is a concern, you could return random salts for unknown users.
// For now, we return 404 which is fine for a vault app where usernames
// are not secret (users choose them).

pub async fn get_salts(
    State(state): State<crate::AppState>,
    Path(username): Path<String>,
) -> Result<Json<SaltResponse>, AppError> {
    let row = sqlx::query("SELECT auth_salt, kek_salt FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&state.db)
        .await?;

    let row = row.ok_or_else(|| {
        AppError::NotFound("User not found".to_string())
    })?;

    Ok(Json(SaltResponse {
        auth_salt: row.get("auth_salt"),
        kek_salt: row.get("kek_salt"),
    }))
}


