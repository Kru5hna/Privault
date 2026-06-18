use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Request Models — What the frontend sends to us
// ─────────────────────────────────────────────────────────────────────────────

/// Registration payload.
///
/// The client generates random salts and derives all crypto material locally:
/// - `auth_verifier`: derived from password + auth_salt, sent for server to hash with Argon2id
/// - `auth_salt` / `kek_salt`: random 32-byte salts (base64), stored for future derivations
/// - `public_key`: RSA-OAEP SPKI base64 — used by others to encrypt DEKs for this user
/// - `wrapped_private_key`: RSA private key encrypted with KEK (AES-GCM)
/// - `wrapped_private_key_iv`: the AES-GCM IV used for wrapping (base64)
#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub auth_verifier: String,
    pub auth_salt: String,
    pub kek_salt: String,
    pub public_key: String,
    pub wrapped_private_key: String,
    pub wrapped_private_key_iv: String,
}

/// Login payload.
///
/// The client fetches salts first (GET /api/auth/salt/:username),
/// then derives the auth_verifier from password + auth_salt.
#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub auth_verifier: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Models — What we send back to the frontend
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct RegisterResponse {
    pub id: String,
    pub message: String,
}

/// Login response — provides everything the client needs to unwrap their private key.
///
/// The `session_token` is a raw random token (base64). Only its SHA-256 hash
/// is stored in the database, so a DB leak doesn't compromise active sessions.
#[derive(Serialize)]
pub struct LoginResponse {
    pub message: String,
    pub session_token: String,
    pub user_id: String,
    pub username: String,
    pub wrapped_private_key: String,
    pub wrapped_private_key_iv: String,
    pub public_key: String,
    pub kek_salt: String,
}

/// Salt lookup response — returned before login so the client can derive keys.
#[derive(Serialize)]
pub struct SaltResponse {
    pub auth_salt: String,
    pub kek_salt: String,
}

/// Generic message response for logout, etc.
#[derive(Serialize)]
pub struct MessageResponse {
    pub message: String,
}

/// Me endpoint response — basic user profile from an active session.
#[derive(Serialize)]
#[allow(dead_code)]
pub struct MeResponse {
    pub user_id: String,
    pub username: String,
}
