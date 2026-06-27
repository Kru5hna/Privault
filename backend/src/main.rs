mod activity;
mod auth;
mod audit;
mod documents;
mod email;
mod error;
mod folders;
mod ratelimit;
mod recovery;
mod security_headers;
mod shares;
mod storage;
mod tags;
mod trash;
mod usage;
mod validation;

use axum::{routing::get, Json, Router};
use std::net::SocketAddr;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::auth::AuthSession;
use crate::error::AppError;
use crate::storage::StorageService;
use axum::http::{header, HeaderValue, Method};
use sqlx::Row;

/// Shared application state — passed to all handlers via Axum's State extractor.
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub storage: StorageService,
    pub email: email::EmailService,
}

#[tokio::main]
async fn main() {
    // Load environment variables from .env file.
    // If running from the workspace root, fallback to loading backend/.env.
    if dotenvy::dotenv().is_err() {
        dotenvy::from_path("backend/.env").ok();
    }

    // Initialize structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| {
                    // Default to `info` in production; explicit `debug`
                    // env var (`RUST_LOG=privault_backend=debug`) still
                    // works for troubleshooting.
                    "privault_backend=info,tower_http=info".into()
                }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Initializing Privault backend...");

    // Database connection pool
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env");

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

    // Initialize S3 client
    let aws_config = aws_config::load_from_env().await;
    let s3_client = aws_sdk_s3::Client::new(&aws_config);
    let bucket_name = std::env::var("AWS_BUCKET_NAME").expect("AWS_BUCKET_NAME must be set");
    let storage = StorageService::new(s3_client, bucket_name);

    // Resend email service
    let resend_api_key = std::env::var("RESEND_API_KEY").expect("RESEND_API_KEY must be set");
    let from_email = std::env::var("FROM_EMAIL").unwrap_or_else(|_| "mail@localprivault.com".to_string());
    let frontend_url = std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let email = email::EmailService::new(resend_api_key, from_email, frontend_url);

    let state = AppState {
        db: db_pool,
        storage,
        email,
    };

    // Run trash cleanup on startup
    trash::cleanup_expired_trash(&state).await;

    // Purge legacy "Preview" activity entries — previews are no longer tracked
    let deleted = sqlx::query("DELETE FROM activity_logs WHERE action = 'Preview'")
        .execute(&state.db)
        .await;
    match deleted {
        Ok(result) => {
            let count = result.rows_affected();
            if count > 0 {
                tracing::info!("Purged {count} legacy Preview activity log entries");
            }
        }
        Err(e) => tracing::warn!("Failed to purge Preview activity logs: {e}"),
    }

    // CORS — explicit allowlists only. No `*` wildcard for any
    // field. If `CORS_ORIGIN` is unset, fail-closed to localhost.
    let cors_origin = std::env::var("CORS_ORIGIN")
        .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".to_string());

    if cors_origin.trim() == "*" {
        panic!(
            "CORS_ORIGIN=* is not allowed. Specify an explicit comma-separated \
             list of origins (e.g. https://your-frontend.example)."
        );
    }

    let origins: Vec<HeaderValue> = cors_origin
        .split(',')
        .filter_map(|o| o.trim().parse::<HeaderValue>().ok())
        .collect();

    if origins.is_empty() {
        panic!("CORS_ORIGIN did not contain any valid origins");
    }

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        // Explicit method list — no `Any`. Anything outside this
        // set is rejected at the preflight stage.
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        // Explicit header list — only Authorization and Content-Type.
        // Custom headers (X-CSRF-Token etc.) must be added here
        // intentionally when introduced.
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        // Never allow credentials via wildcard — we use Bearer
        // tokens, not cookies, so this is intentionally absent.
        .allow_credentials(false)
        // Cache preflight for 1 hour.
        .max_age(std::time::Duration::from_secs(3600));

    // Route tree
    let app = Router::new()
        .route("/", get(root))
        .route("/api/health", get(health_check))
        .route("/api/me", get(get_me))
        .route("/api/me/usage", get(usage::get_usage))
        .nest("/api/activity", activity::router())
        .nest("/api/auth", auth::router())
        .nest("/api/recovery", recovery::router())
        .nest("/api/documents", documents::router())
        .nest("/api/folders", folders::router())
        .nest("/api/shares", shares::router())
        .nest("/api/tags", tags::router())
        .nest("/api/trash", trash::router())
        .with_state(state);

    // Layer ordering: outermost last. Security headers wrap CORS
    // so they appear on CORS preflight responses too.
    let mut app = app.layer(cors);
    for (name, value) in security_headers::layers() {
        app = app.layer(tower_http::set_header::SetResponseHeaderLayer::if_not_present(
            name,
            value,
        ));
    }
    let app = app;

    let max_upload_bytes: usize = std::env::var("MAX_UPLOAD_BYTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100 * 1024 * 1024);
    tracing::info!("Max upload size set to {} MB", max_upload_bytes / (1024 * 1024));

    let app = app.layer(axum::extract::DefaultBodyLimit::max(max_upload_bytes));

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
async fn get_me(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: AuthSession,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query(
        "SELECT email, email_verified FROM users WHERE id = $1",
    )
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    let email: Option<String> = row.get("email");
    let email_verified: bool = row.get("email_verified");

    Ok(Json(serde_json::json!({
        "user_id": session.user_id.to_string(),
        "username": session.username,
        "email": email,
        "email_verified": email_verified,
    })))
}

async fn root() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "Privault API",
        "status": "online"
    }))
}
