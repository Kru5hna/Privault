use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::Row;

use crate::error::AppError;

// ── Request Structs (What the frontend sends to us) ──────────────────────

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub auth_hash: String,
    pub public_key: String,
    pub wrapped_private_key: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub auth_hash: String,
}

// ── Response Structs (What we send back to the frontend) ─────────────────

#[derive(Serialize)]
pub struct RegisterResponse {
    pub id: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub message: String,
    pub user_id: String,
    pub wrapped_private_key: String,
    // TODO: Add JWT token here in the next step
}

// ── Auth Router (nested under /api/auth in main.rs) ──────────────────────

// This function returns a Router with auth-specific routes.
// In Express terms, this is like:
//   const authRouter = express.Router();
//   authRouter.post('/register', registerHandler);
//   authRouter.post('/login', loginHandler);
//   module.exports = authRouter;
pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
}

// ── Handlers ─────────────────────────────────────────────────────────────

async fn register(
    State(state): State<crate::AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, AppError> {
    // Validate that no fields are empty
    if payload.username.trim().is_empty() || payload.auth_hash.trim().is_empty() {
        return Err(AppError::BadRequest("Username and auth_hash are required".to_string()));
    }

    // Check if username already exists
    let existing_user = sqlx::query("SELECT id FROM users WHERE username = $1")
        .bind(&payload.username)
        .fetch_optional(&state.db)
        .await?;

    if existing_user.is_some() {
        return Err(AppError::BadRequest("Username already taken".to_string()));
    }

    // Insert the new user into the database
    let row = sqlx::query(
        r#"
        INSERT INTO users (username, auth_hash, public_key, wrapped_private_key)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(&payload.username)
    .bind(&payload.auth_hash)
    .bind(&payload.public_key)
    .bind(&payload.wrapped_private_key)
    .fetch_one(&state.db)
    .await?;

    // Extract the UUID from the returned row
    let user_id: uuid::Uuid = row.get("id");

    tracing::info!("New user registered: {} ({})", payload.username, user_id);

    Ok(Json(RegisterResponse {
        id: user_id.to_string(),
        message: "User registered successfully".to_string(),
    }))
}

async fn login(
    State(state): State<crate::AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, AppError> {
    // Validate input
    if payload.username.trim().is_empty() || payload.auth_hash.trim().is_empty() {
        return Err(AppError::BadRequest("Username and auth_hash are required".to_string()));
    }

    // Find the user by username
    let row = sqlx::query(
        "SELECT id, auth_hash, wrapped_private_key FROM users WHERE username = $1",
    )
    .bind(&payload.username)
    .fetch_optional(&state.db)
    .await?;

    // If user not found, return a generic error (don't reveal whether the username exists)
    let row = match row {
        Some(r) => r,
        None => return Err(AppError::BadRequest("Invalid username or password".to_string())),
    };

    // Compare the auth_hash from the request with the one stored in the database
    let stored_hash: String = row.get("auth_hash");
    if stored_hash != payload.auth_hash {
        return Err(AppError::BadRequest("Invalid username or password".to_string()));
    }

    let user_id: uuid::Uuid = row.get("id");
    let wrapped_private_key: String = row.get("wrapped_private_key");

    tracing::info!("User logged in: {} ({})", payload.username, user_id);

    Ok(Json(LoginResponse {
        message: "Login successful".to_string(),
        user_id: user_id.to_string(),
        wrapped_private_key,
        // TODO: Generate and return JWT token
    }))
}
