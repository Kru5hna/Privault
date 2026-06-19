mod auth;
mod documents;
mod error;
mod folders;
mod shares;
mod tags;

use axum::{routing::get, Json, Router};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::auth::AuthSession;
use crate::error::AppError;

/// Shared application state — passed to all handlers via Axum's State extractor.
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
}

#[tokio::main]
async fn main() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Initialize structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "privault_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Initializing Privault backend...");

    // Database connection pool
    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env");

    // Disable prepared statement cache for PgBouncer (Supabase) compatibility
    let db_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect_with(
            database_url
                .parse::<sqlx::postgres::PgConnectOptions>()
                .expect("Invalid DATABASE_URL format")
                .statement_cache_capacity(0),
        )
        .await
        .expect("Failed to connect to PostgreSQL");

    tracing::info!("Database connection established");

    // Ensure local uploads directory exists
    tokio::fs::create_dir_all("uploads")
        .await
        .expect("Failed to create uploads directory");

    let state = AppState { db: db_pool };

    // CORS — restrict to known origins in production.
    // TODO: Read allowed origins from env var for production deployment.
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Route tree
    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/me", get(get_me))
        .nest("/api/auth", auth::router())
        .nest("/api/documents", documents::router())
        .nest("/api/folders", folders::router())
        .nest("/api/shares", shares::router())
        .nest("/api/tags", tags::router())
        .with_state(state)
        .layer(cors)
        .layer(axum::extract::DefaultBodyLimit::max(100 * 1024 * 1024));

    // Bind and serve
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .expect("Invalid address format");

    tracing::info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Health check — verifies the server and database connection are operational.
async fn health_check(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query("SELECT 1").execute(&state.db).await?;

    Ok(Json(serde_json::json!({
        "status": "OK",
        "message": "Privault backend is operational"
    })))
}

/// Protected route — returns the authenticated user's profile.
/// The `AuthSession` parameter IS the middleware: if the session token is
/// missing, invalid, or expired, Axum returns 401 and this function never runs.
async fn get_me(session: AuthSession) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "user_id": session.user_id.to_string(),
        "username": session.username
    }))
}
