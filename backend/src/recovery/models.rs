use serde::{Deserialize, Serialize};

// ─────────────────────────────────────────────────────────────────────────────
// Request Models
// ─────────────────────────────────────────────────────────────────────────────

/// Payload for storing the recovery-wrapped private key.
#[derive(Deserialize)]
pub struct StoreRecoveryKeyRequest {
    /// RSA private key encrypted with recovery-derived KEK (AES-GCM), base64
    pub recovery_wrapped_key: String,
    /// AES-GCM IV used for the recovery-wrapped key, base64
    pub recovery_wrapped_key_iv: String,
}

/// Payload for recovery login.
#[derive(Deserialize)]
pub struct RecoverRequest {
    pub username: String,
    /// The 12-word recovery phrase (space-separated)
    pub recovery_phrase: String,
}

/// Payload for setting a new password after recovery.
#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub auth_verifier: String,
    pub auth_salt: String,
    pub kek_salt: String,
    pub wrapped_private_key: String,
    pub wrapped_private_key_iv: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Models
// ─────────────────────────────────────────────────────────────────────────────

/// Response after successful recovery login.
#[derive(Serialize)]
pub struct RecoverResponse {
    pub message: String,
    pub session_token: String,
    pub user_id: String,
    pub username: String,
    /// RSA private key encrypted with recovery-derived KEK
    pub recovery_wrapped_key: String,
    /// AES-GCM IV for the recovery-wrapped key
    pub recovery_wrapped_key_iv: String,
    /// RSA public key (same key pair, encrypted differently)
    pub public_key: String,
}

/// Generic message response.
#[derive(Serialize)]
pub struct MessageResponse {
    pub message: String,
}
