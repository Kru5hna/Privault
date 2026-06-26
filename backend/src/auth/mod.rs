//! Authentication module for Privault.
//!
//! Provides zero-knowledge auth with:
//! - Argon2id server-side hashing of client-derived auth verifiers
//! - Session-based auth (no JWT) with SHA-256 hashed tokens
//! - Per-user random salts for auth and key-wrapping derivations
//!
//! File structure:
//! - `models.rs`   — Request/response structs
//! - `handlers.rs` — Route handler functions
//! - `session.rs`  — Session token extractor middleware

mod handlers;
mod models;
pub mod session;

use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};

// Re-export the session extractor so other modules can use `auth::AuthSession`
pub use session::AuthSession;

/// Creates the auth sub-router, nested under `/api/auth` in main.rs.
///
/// Routes:
/// - `POST /register` — create a new user with client-derived crypto material
/// - `POST /login`    — authenticate and receive a session token
/// - `POST /logout`   — revoke all sessions for the current user
/// - `GET  /salt/:username` — fetch salts needed for client-side key derivation
/// - `GET  /verify-email`   — verify email address via token
/// - `GET  /sessions`       — list all active sessions
/// - `DELETE /sessions/:id` — revoke a specific session
/// - `DELETE /sessions`     — revoke all sessions except current
pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route(
            "/register",
            post(handlers::register).route_layer(middleware::from_fn(
                crate::ratelimit::rate_limit_register,
            )),
        )
        .route(
            "/login",
            post(handlers::login).route_layer(middleware::from_fn(
                crate::ratelimit::rate_limit_login,
            )),
        )
        .route("/logout", post(handlers::logout))
        .route("/salt/:username", get(handlers::get_salts))
        .route(
            "/verify-email",
            get(handlers::verify_email).route_layer(middleware::from_fn(
                crate::ratelimit::rate_limit_email_verify,
            )),
        )
        .route(
            "/change-password",
            post(handlers::change_password).route_layer(middleware::from_fn(
                crate::ratelimit::rate_limit_change_password,
            )),
        )
        .route("/account", delete(handlers::delete_account))
        .route(
            "/sessions",
            get(handlers::list_sessions)
                .delete(handlers::revoke_all_sessions)
                .route_layer(middleware::from_fn(
                    crate::ratelimit::rate_limit_revoke,
                )),
        )
        .route(
            "/sessions/:id",
            delete(handlers::revoke_session).route_layer(middleware::from_fn(
                crate::ratelimit::rate_limit_revoke,
            )),
        )
}
