use axum::{
    extract::{Path, Query, State},
    Json,
};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::RngCore;
use sqlx::Row;
use uuid::Uuid;

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
    // Validate required fields + format
    crate::validation::validate_username(&payload.username)?;

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

    // Validate email format (normalizes to lowercase)
    let email = crate::validation::validate_email(&payload.email)?;

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

    // Generate verification token
    let verification_token = Uuid::new_v4().to_string();

    // Insert the new user
    let row = sqlx::query(
        r#"
        INSERT INTO users (username, auth_hash, auth_salt, kek_salt, public_key,
                           wrapped_private_key, wrapped_private_key_iv,
                           recovery_phrase_hash, recovery_auth_hash,
                           email, email_verification_token, email_verification_sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
    .bind(&email)
    .bind(&verification_token)
    .bind(chrono::Utc::now())
    .fetch_one(&state.db)
    .await?;

    let user_id: uuid::Uuid = row.get("id");
    tracing::info!("New user registered: {} ({})", payload.username, user_id);

    // Send verification email (non-blocking — log errors, don't fail registration)
    let email_sent = {
        state.email.send_verification(&email, &payload.username, &verification_token).await;
        true
    };

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
        email_sent,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

pub async fn login(
    State(state): State<crate::AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    tracing::info!("[LOGIN] Attempt for username: '{}'", payload.username.trim());

    // Validate input
    if payload.username.trim().is_empty() || payload.auth_verifier.trim().is_empty() {
        tracing::warn!("[LOGIN] Rejected: empty username or auth_verifier");
        return Err(AppError::BadRequest(
            "Username and auth verifier are required".to_string(),
        ));
    }

    // Find the user
    let row = sqlx::query(
        r#"
        SELECT id, username, auth_hash, auth_salt, kek_salt, public_key, wrapped_private_key, wrapped_private_key_iv
        FROM users
        WHERE username = $1
        "#,
    )
    .bind(&payload.username)
    .fetch_optional(&state.db)
    .await?;

    let row = match row {
        Some(r) => r,
        None => {
            tracing::warn!("[LOGIN] User '{}' not found", payload.username);
            return Err(AppError::BadRequest("Invalid username or password".to_string()));
        }
    };

    // Verify password
    let stored_hash: String = row.get("auth_hash");
    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Stored hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(payload.auth_verifier.as_bytes(), &parsed_hash)
        .map_err(|_| {
            tracing::warn!("[LOGIN] Password verification FAILED for '{}'", payload.username);
            AppError::BadRequest("Invalid username or password".to_string())
        })?;

    // Generate session token
    let mut token_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut token_bytes);
    let session_token = base64::Engine::encode(
        &base64::engine::general_purpose::URL_SAFE_NO_PAD,
        token_bytes,
    );

    let token_hash_hex = hash_token(&session_token);
    let user_id: uuid::Uuid = row.get("id");
    // Idle session length (sliding — refreshes on use up to hard cap).
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(crate::auth::session::SESSION_IDLE_HOURS);

    // Capture IP + User-Agent for fingerprint binding
    let ip_address: Option<String> = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let user_agent: Option<String> = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // Build prefix columns for the session-fingerprint check
    let ip_prefix = ip_address
        .as_deref()
        .map(crate::auth::session::ip_prefix);
    let ua_prefix = user_agent
        .as_deref()
        .map(crate::auth::session::ua_prefix);

    sqlx::query(
        r#"
        INSERT INTO sessions (
            user_id, token_hash, expires_at,
            ip_address, user_agent, ip_prefix, ua_prefix, last_used_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        "#,
    )
    .bind(user_id)
    .bind(&token_hash_hex)
    .bind(expires_at)
    .bind(&ip_address)
    .bind(&user_agent)
    .bind(&ip_prefix)
    .bind(&ua_prefix)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("[LOGIN] Session INSERT failed: {}", e);
        AppError::Internal(anyhow::anyhow!("Session insert error: {}", e))
    })?;

    let username: String = row.get("username");
    tracing::info!("[LOGIN] SUCCESS — user '{}' ({})", username, user_id);

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
        auth_salt: row.get("auth_salt"),
        kek_salt: row.get("kek_salt"),
    }))
}


// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/verify-email?token=xxx
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct VerifyQuery {
    pub token: String,
}

pub async fn verify_email(
    State(state): State<crate::AppState>,
    Query(query): Query<VerifyQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Find user with this verification token
    let row = sqlx::query(
        r#"
        SELECT id, username, email FROM users
        WHERE email_verification_token = $1
          AND email_verified = false
          AND email_verification_sent_at > NOW() - INTERVAL '24 hours'
        "#,
    )
    .bind(&query.token)
    .fetch_optional(&state.db)
    .await?;

    let (user_id, username, email) = match row {
        Some(r) => {
            let id: Uuid = r.get("id");
            let uname: String = r.get("username");
            let em: Option<String> = r.get("email");
            (id, uname, em)
        }
        None => return Err(AppError::BadRequest("Invalid or expired verification token".to_string())),
    };

    // Mark email as verified
    sqlx::query(
        r#"
        UPDATE users
        SET email_verified = true,
            email_verification_token = NULL,
            email_verification_sent_at = NULL
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .execute(&state.db)
    .await?;

    tracing::info!("Email verified for user: {} ({})", username, user_id);

    // Send welcome email (non-blocking)
    if let Some(ref email_addr) = email {
        state.email.send_welcome(email_addr, &username).await;
    }

    Ok(Json(serde_json::json!({
        "message": "Email verified successfully",
        "verified": true,
    })))
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
    // Validate the path-param username format BEFORE hitting the DB.
    // Prevents giant usernames being used as a DoS vector against the
    // lookup query, and surfaces a clean error for malformed input.
    crate::validation::validate_username(&username)?;

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
//
// Authenticated user changes their master password. Unlike the recovery
// change-password endpoint, this preserves recovery phrase and recovery
// key material.

pub async fn change_password(
    State(state): State<crate::AppState>,
    session: AuthSession,
    Json(payload): Json<ChangePasswordRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    if payload.current_auth_verifier.trim().is_empty() {
        return Err(AppError::BadRequest("Current auth verifier is required".to_string()));
    }
    if payload.new_auth_verifier.trim().is_empty() {
        return Err(AppError::BadRequest("New auth verifier is required".to_string()));
    }
    if payload.new_auth_salt.trim().is_empty() || payload.new_kek_salt.trim().is_empty() {
        return Err(AppError::BadRequest("New salts are required".to_string()));
    }
    if payload.new_wrapped_private_key.trim().is_empty() {
        return Err(AppError::BadRequest("New wrapped private key is required".to_string()));
    }
    if payload.new_wrapped_private_key_iv.trim().is_empty() {
        return Err(AppError::BadRequest("New wrapped private key IV is required".to_string()));
    }

    // Length bounds — block pathologically short verifiers (brute-force
    // risk) and oversized blobs (DoS / quota risk).
    fn check_len(field: &str, value: &str) -> Result<(), AppError> {
        if value.len() < 32 {
            return Err(AppError::BadRequest(format!("{} is too short", field)));
        }
        if value.len() > 4096 {
            return Err(AppError::BadRequest(format!("{} is too long", field)));
        }
        Ok(())
    }
    check_len("current_auth_verifier", &payload.current_auth_verifier)?;
    check_len("new_auth_verifier", &payload.new_auth_verifier)?;
    check_len("new_wrapped_private_key", &payload.new_wrapped_private_key)?;

    // Fetch current auth_hash to verify the current password
    let row = sqlx::query("SELECT auth_hash FROM users WHERE id = $1")
        .bind(session.user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let stored_hash: String = row.get("auth_hash");
    let parsed_hash = PasswordHash::new(&stored_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Stored hash parse error: {}", e)))?;

    Argon2::default()
        .verify_password(payload.current_auth_verifier.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::BadRequest("Current password is incorrect".to_string()))?;

    // Hash the new auth_verifier with Argon2id
    let argon2 = Argon2::default();
    let new_salt = SaltString::generate(&mut OsRng);
    let new_auth_hash = argon2
        .hash_password(payload.new_auth_verifier.as_bytes(), &new_salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Argon2 hash failed: {}", e)))?
        .to_string();

    // Update user — keep recovery fields intact
    sqlx::query(
        r#"
        UPDATE users
        SET auth_hash = $1,
            auth_salt = $2,
            kek_salt = $3,
            wrapped_private_key = $4,
            wrapped_private_key_iv = $5
        WHERE id = $6
        "#,
    )
    .bind(&new_auth_hash)
    .bind(&payload.new_auth_salt)
    .bind(&payload.new_kek_salt)
    .bind(&payload.new_wrapped_private_key)
    .bind(&payload.new_wrapped_private_key_iv)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    tracing::info!("Password changed: {} ({})", session.username, session.user_id);

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_PASSWORD_CHANGED,
        None,
        None,
        None,
        None,
    ).await;

    Ok(Json(MessageResponse {
        message: "Password changed successfully".to_string(),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/account
// ─────────────────────────────────────────────────────────────────────────────
//
// Permanently deletes the user's account and all associated data.
// S3 objects (documents, thumbnails) are deleted first, then the user
// record is removed — all FK cascades handle the rest.

pub async fn delete_account(
    State(state): State<crate::AppState>,
    session: AuthSession,
    Json(_payload): Json<DeleteAccountRequest>,
) -> Result<Json<MessageResponse>, AppError> {
    // 1. Collect all document IDs for S3 cleanup
    let docs = sqlx::query_as::<_, (uuid::Uuid, Option<String>)>(
        "SELECT id, thumbnail_path FROM documents WHERE owner_id = $1",
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await?;

    // 2. Delete S3 objects (best-effort per object)
    for (doc_id, thumb_path) in &docs {
        let doc_key = crate::storage::StorageService::doc_key(doc_id);
        if let Err(e) = state.storage.delete_object(&doc_key).await {
            tracing::warn!("Failed to delete S3 object {}: {}", doc_key, e);
        }
        if let Some(thumb) = thumb_path {
            if let Err(e) = state.storage.delete_object(thumb).await {
                tracing::warn!("Failed to delete S3 thumbnail {}: {}", thumb, e);
            }
        }
    }

    // 3. Delete the user — ON DELETE CASCADE cleans up:
    //    documents, folders, share_links, tags, document_tags, sessions, audit_logs
    //
    // Note: audit_logs are cascaded away with the user (audit_logs.user_id
    // REFERENCES users(id) ON DELETE CASCADE), so account deletion is by
    // design not auditable in the audit table. This is consistent with the
    // privacy stance: deleting the account purges all history. The action
    // is still observable through structured server logs.
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    tracing::info!("Account deleted: {} ({})", session.username, session.user_id);

    Ok(Json(MessageResponse {
        message: "Account deleted permanently".to_string(),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/sessions — list all active sessions for the current user
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub created_at: String,
    pub expires_at: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub is_current: bool,
}

pub async fn list_sessions(
    session: AuthSession,
    State(state): State<crate::AppState>,
) -> Result<Json<Vec<SessionInfo>>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT id, created_at, expires_at, ip_address, user_agent, token_hash
        FROM sessions
        WHERE user_id = $1 AND expires_at > NOW()
        ORDER BY created_at DESC
        "#,
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await?;

    let now = chrono::Utc::now();
    let sessions: Vec<SessionInfo> = rows
        .into_iter()
        .map(|row| {
            let id: uuid::Uuid = row.get("id");
            let created_at: Option<chrono::DateTime<chrono::Utc>> = row.get("created_at");
            let expires_at: Option<chrono::DateTime<chrono::Utc>> = row.get("expires_at");
            let ip_address: Option<String> = row.get("ip_address");
            let user_agent: Option<String> = row.get("user_agent");
            let token_hash: String = row.get("token_hash");

            SessionInfo {
                id: id.to_string(),
                created_at: created_at.unwrap_or(now).to_rfc3339(),
                expires_at: expires_at.unwrap_or(now).to_rfc3339(),
                ip_address,
                user_agent,
                is_current: token_hash == session.session_token_hash,
            }
        })
        .collect();

    Ok(Json(sessions))
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/sessions/:id — revoke a specific session
// ─────────────────────────────────────────────────────────────────────────────

pub async fn revoke_session(
    session: AuthSession,
    State(state): State<crate::AppState>,
    Path(session_id): Path<uuid::Uuid>,
) -> Result<Json<MessageResponse>, AppError> {
    // Cannot revoke the current session
    let row = sqlx::query(
        r#"
        SELECT token_hash FROM sessions
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(session_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await?;

    let target = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Session not found".to_string())),
    };

    let target_token_hash: String = target.get("token_hash");

    if target_token_hash == session.session_token_hash {
        return Err(AppError::BadRequest("Cannot revoke current session".to_string()));
    }

    sqlx::query("DELETE FROM sessions WHERE id = $1 AND user_id = $2")
        .bind(session_id)
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    tracing::info!("Session revoked: {} by user {}", session_id, session.user_id);

    Ok(Json(MessageResponse {
        message: "Session revoked successfully".to_string(),
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/sessions — revoke all sessions except current
// ─────────────────────────────────────────────────────────────────────────────

pub async fn revoke_all_sessions(
    session: AuthSession,
    State(state): State<crate::AppState>,
) -> Result<Json<MessageResponse>, AppError> {
    let deleted = sqlx::query(
        r#"
        DELETE FROM sessions
        WHERE user_id = $1 AND token_hash != $2
        "#,
    )
    .bind(session.user_id)
    .bind(&session.session_token_hash)
    .execute(&state.db)
    .await?;

    let count = deleted.rows_affected();
    tracing::info!("{} session(s) revoked by user {}", count, session.user_id);

    Ok(Json(MessageResponse {
        message: format!("{} session(s) revoked", count),
    }))
}

