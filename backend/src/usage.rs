use axum::{extract::State, Json};
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

use crate::auth::session::AuthSession;
use crate::error::AppError;

/// User storage usage. Returned by `GET /api/me/usage`.
/// `quota_bytes` reflects the `STORAGE_QUOTA_BYTES` env var (default 100 MB)
/// — single global tier for v1; tiered quotas come later.
#[derive(Serialize)]
pub struct UsageResponse {
    pub used_bytes: i64,
    pub quota_bytes: i64,
    pub document_count: i64,
}

const DEFAULT_QUOTA_BYTES: i64 = 104_857_600; // 100 MB

fn quota_bytes() -> i64 {
    std::env::var("STORAGE_QUOTA_BYTES")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(DEFAULT_QUOTA_BYTES)
}

/// Returns current storage usage for the authenticated user.
/// Single query — counts bytes and rows in one pass.
pub async fn get_usage(
    State(state): State<crate::AppState>,
    session: AuthSession,
) -> Result<Json<UsageResponse>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT
            COALESCE(SUM(size), 0)::BIGINT AS used_bytes,
            COUNT(*)::BIGINT AS document_count
        FROM documents
        WHERE owner_id = $1 AND deleted_at IS NULL
        "#,
    )
    .bind(session.user_id as Uuid)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to query usage: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let used_bytes: i64 = row.get("used_bytes");
    let document_count: i64 = row.get("document_count");

    Ok(Json(UsageResponse {
        used_bytes,
        quota_bytes: quota_bytes(),
        document_count,
    }))
}