//! Recovery phrase module.
//!
//! Generates 12-word BIP39 mnemonics for account recovery.
//! The phrase deterministically derives:
//!   - recovery_auth_verifier → Argon2id hashed → stored as recovery_auth_hash
//!   - recovery_kek → used to unwrap the stored private key during recovery
//!
//! The server only stores SHA-256 hashes of the phrase (for lookup)
//! and Argon2id hashes of the auth verifier. The raw phrase is returned to
//! the client once during registration and never stored.
//!
//! # Security model
//! - Phrase offers FULL account access (same as password)
//! - Server never stores the phrase — only SHA-256 hash for lookup
//! - Recovery KEK is derived from the phrase, never stored
//! - After recovery, user must set a new password (re-wrapping the key pair)

mod handlers;
mod models;
mod wordlist;

use axum::{routing::post, Router};

/// Creates the recovery sub-router, nested under `/api/recovery` in main.rs.
pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/store-key", post(handlers::store_key))
        .route("/recover", post(handlers::recover))
        .route("/change-password", post(handlers::change_password))
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions (used by handlers)
// ─────────────────────────────────────────────────────────────────────────────

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use rand::RngCore;
use sha2::{Digest, Sha256};

use crate::error::AppError;

/// Generate a 12-word BIP39 recovery phrase with entropy and checksum.
///
/// Uses 128 bits of cryptographically secure randomness, SHA-256 checksum,
/// and the full BIP39 English wordlist (2048 words).
pub fn generate_phrase() -> Vec<String> {
    let mut entropy = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut entropy);

    let hash = Sha256::digest(&entropy);
    let checksum = hash[0] >> 4;

    let mut bits = Vec::with_capacity(132);
    for byte in entropy.iter() {
        for b in (0..8).rev() {
            bits.push((byte >> b) & 1);
        }
    }
    for b in (0..4).rev() {
        bits.push((checksum >> b) & 1);
    }

    let mut words = Vec::with_capacity(12);
    for i in 0..12 {
        let mut index = 0u16;
        for j in 0..11 {
            index = (index << 1) | bits[i * 11 + j] as u16;
        }
        words.push(wordlist::BIP39_WORDS[index as usize].to_string());
    }

    words
}

/// Validate a 12-word BIP39 phrase by verifying its checksum.
pub fn validate_phrase(phrase: &str) -> Result<[u8; 16], String> {
    let words: Vec<&str> = phrase.split_whitespace().collect();
    if words.len() != 12 {
        return Err(format!("Phrase must be 12 words, got {}", words.len()));
    }

    let word_to_index: std::collections::HashMap<&str, u16> = wordlist::BIP39_WORDS
        .iter()
        .enumerate()
        .map(|(i, w)| (*w, i as u16))
        .collect();

    let mut bits = Vec::with_capacity(132);
    for word in &words {
        let index = word_to_index
            .get(word)
            .ok_or_else(|| format!("Invalid word '{}'", word))?;
        for b in (0..11).rev() {
            bits.push(((index >> b) & 1) as u8);
        }
    }

    let mut entropy = [0u8; 16];
    for i in 0..128 {
        if bits[i] == 1 {
            entropy[i / 8] |= 1 << (7 - (i % 8));
        }
    }

    let mut expected_checksum = 0u8;
    for i in 0..4 {
        expected_checksum = (expected_checksum << 1) | bits[128 + i];
    }

    let hash = Sha256::digest(&entropy);
    let actual_checksum = hash[0] >> 4;

    if expected_checksum != actual_checksum {
        return Err("Invalid checksum — phrase may contain a typo".to_string());
    }

    Ok(entropy)
}

/// Join a phrase vector into a single space-separated string.
pub fn phrase_to_string(words: &[String]) -> String {
    words.join(" ")
}

/// SHA-256 hash of the phrase (for server-side lookup).
pub fn hash_phrase(phrase: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(phrase.as_bytes());
    hex::encode(hasher.finalize())
}

/// Derive the recovery auth verifier from the phrase.
/// Client sends this during recovery; server hashes it with Argon2id.
pub fn derive_recovery_auth_verifier(phrase: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(phrase.as_bytes());
    hasher.update(b":privault-auth:");
    hex::encode(hasher.finalize())
}

/// Hash a recovery auth verifier with Argon2id (same as password auth_verifier).
pub fn hash_recovery_auth_verifier(verifier: &str) -> Result<String, AppError> {
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut OsRng);
    argon2
        .hash_password(verifier.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Argon2 hash failed: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_phrase_returns_12_words() {
        let phrase = generate_phrase();
        assert_eq!(phrase.len(), 12);
    }

    #[test]
    fn test_generate_phrase_all_words_in_wordlist() {
        let phrase = generate_phrase();
        let word_set: std::collections::HashSet<&str> =
            wordlist::BIP39_WORDS.iter().copied().collect();
        for word in &phrase {
            assert!(word_set.contains(word.as_str()), "word '{}' not in BIP39 list", word);
        }
    }

    #[test]
    fn test_generate_phrase_different_each_time() {
        let a = generate_phrase();
        let b = generate_phrase();
        assert_ne!(a, b, "two consecutive calls produced identical phrases");
    }

    #[test]
    fn test_phrase_roundtrip() {
        let words = generate_phrase();
        let phrase = words.join(" ");
        let result = validate_phrase(&phrase);
        assert!(result.is_ok(), "validate_phrase failed on freshly generated phrase: {:?}", result);
    }

    #[test]
    fn test_validate_rejects_wrong_length() {
        let err = validate_phrase("abandon ability able").unwrap_err();
        assert!(err.contains("12 words"), "expected length error, got: {}", err);
    }

    #[test]
    fn test_validate_rejects_invalid_word() {
        let err = validate_phrase("notarealword ability able about above absent absorb abstract absurd abuse access accident").unwrap_err();
        assert!(err.contains("Invalid word"), "expected invalid word error, got: {}", err);
    }

    #[test]
    fn test_validate_rejects_bad_checksum() {
        let words = generate_phrase();
        let mut bad = words.clone();
        // Replace last word with a different valid word
        let last = bad.last().unwrap().clone();
        for w in wordlist::BIP39_WORDS.iter() {
            if *w != last {
                bad[11] = w.to_string();
                break;
            }
        }
        let phrase = bad.join(" ");
        let result = validate_phrase(&phrase);
        assert!(result.is_err(), "expected checksum error, but validation passed");
        assert!(result.unwrap_err().contains("checksum"));
    }

    #[test]
    fn test_phrase_to_string() {
        let words = vec!["hello".to_string(), "world".to_string()];
        assert_eq!(phrase_to_string(&words), "hello world");
    }

    #[test]
    fn test_hash_phrase_deterministic() {
        let phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
        let h1 = hash_phrase(phrase);
        let h2 = hash_phrase(phrase);
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_hash_phrase_different() {
        let h1 = hash_phrase("abandon ability able about above absent absorb abstract absurd abuse access accident");
        let h2 = hash_phrase("ability abandon able about above absent absorb abstract absurd abuse access accident");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_derive_recovery_auth_verifier_deterministic() {
        let phrase = "abandon ability able about above absent absorb abstract absurd abuse access accident";
        let v1 = derive_recovery_auth_verifier(phrase);
        let v2 = derive_recovery_auth_verifier(phrase);
        assert_eq!(v1, v2);
    }
}
