use axum::{extract::State, Json};
use sqlx::Row;

use crate::auth::AuthSession;
use crate::error::AppError;
use crate::AppState;

use super::models::{ActivityLogEntry, ActivityLogListResponse, LogActivityRequest};

pub async fn log_activity(
    State(state): State<AppState>,
    session: AuthSession,
    Json(body): Json<LogActivityRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query(
        "INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)",
    )
    .bind(session.user_id)
    .bind(&body.action)
    .bind(&body.details)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}

pub async fn get_activity(
    State(state): State<AppState>,
    session: AuthSession,
) -> Result<Json<ActivityLogListResponse>, AppError> {
    let rows = sqlx::query(
        "SELECT id, action, details, created_at FROM activity_logs WHERE user_id = $1 AND action != 'Preview' ORDER BY created_at DESC LIMIT 500",
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await?;

    let logs: Vec<ActivityLogEntry> = rows
        .iter()
        .map(|row| ActivityLogEntry {
            id: row.get("id"),
            action: row.get("action"),
            details: row.get("details"),
            created_at: row.get("created_at"),
        })
        .collect();

    let total = logs.len();

    Ok(Json(ActivityLogListResponse { logs, total }))
}

pub async fn clear_activity(
    State(state): State<AppState>,
    session: AuthSession,
) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query("DELETE FROM activity_logs WHERE user_id = $1")
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "status": "ok" })))
}
