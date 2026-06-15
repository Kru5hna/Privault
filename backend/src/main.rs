mod error;

use axum::{extract::State, routing::get, Json, Router};
use error::AppError;
use serde::Serialize;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Serialize)]
struct HealthStatus {
    status: String,
    message: String,
}

// Shareable application state (similar to expressing config/db on app.locals)
#[derive(Clone)]
struct AppState {
    db: sqlx::PgPool,
}

#[tokio::main]
async fn main() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    // Initialize tracing/logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "privault_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Initializing Privault backend database and server...");

    // Get Database URL from environment
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set in .env");

    // Establish connection pool to Supabase Postgres (checks connection on startup)
    let db_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Supabase PostgreSQL");

    tracing::info!("Successfully connected to database");

    // Create AppState
    let state = AppState { db: db_pool };

    // Define CORS Layer
    let cors = CorsLayer::permissive();

    // Setup routes with shared State
    let app = Router::new()
        .route("/api/health", get(health_check))
        .route("/api/test-error", get(test_error))
        .with_state(state) // Share the database pool with handlers
        .layer(cors);

    // Bind Address
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr_str = format!("0.0.0.0:{}", port);
    let addr: SocketAddr = addr_str.parse().expect("Invalid address format");

    tracing::info!("Server listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check(State(state): State<AppState>) -> Result<Json<HealthStatus>, AppError> {
    // Perform a test query to verify connection to Supabase database
    sqlx::query("SELECT 1")
        .execute(&state.db)
        .await?;

    Ok(Json(HealthStatus {
        status: "OK".to_string(),
        message: "Privault Backend is operational and database connection is healthy".to_string(),
    }))
}

async fn test_error(State(_state): State<AppState>) -> Result<Json<serde_json::Value>, AppError> {
    Err(AppError::BadRequest("This is a simulated bad request error".to_string()))
}
