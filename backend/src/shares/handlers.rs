use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::{auth::AuthSession, error::AppError, AppState};
use super::models::ShareLinkResponse;

#[derive(Deserialize)]
pub struct CreateShareLinkPayload {
    pub document_id: Uuid,
    pub encrypted_dek: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub download_limit: Option<i32>,
    pub owner_encrypted_link_key: Option<String>,
}

/// Create a new cryptographic share link for a document
pub async fn create_share_link(
    session: AuthSession,
    State(state): State<AppState>,
    Json(payload): Json<CreateShareLinkPayload>,
) -> Result<Json<ShareLinkResponse>, AppError> {
    // Verify document ownership
    let doc = sqlx::query!(
        "SELECT name, size FROM documents WHERE id = $1 AND owner_id = $2",
        payload.document_id,
        session.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error verifying document ownership: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let doc = match doc {
        Some(d) => d,
        None => return Err(AppError::Unauthorized("You do not own this document".to_string())),
    };

    let share_id = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO share_links (id, document_id, owner_id, encrypted_dek, expires_at, download_limit, owner_encrypted_link_key)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        share_id,
        payload.document_id,
        session.user_id,
        payload.encrypted_dek,
        payload.expires_at,
        payload.download_limit,
        payload.owner_encrypted_link_key
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert share link: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(ShareLinkResponse {
        id: share_id,
        document_id: payload.document_id,
        document_name: doc.name,
        document_size: doc.size,
        encrypted_dek: payload.encrypted_dek,
        expires_at: payload.expires_at,
        download_limit: payload.download_limit,
        downloads_count: 0,
        created_at: Some(Utc::now()),
        owner_encrypted_link_key: payload.owner_encrypted_link_key,
    }))
}

/// Get public metadata of a share link
pub async fn get_share_link(
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<ShareLinkResponse>, AppError> {
    let row = sqlx::query!(
        r#"
        SELECT s.id, s.document_id, s.encrypted_dek, s.expires_at, s.download_limit, s.downloads_count, s.created_at, s.owner_encrypted_link_key,
               d.name AS document_name, d.size AS document_size
        FROM share_links s
        JOIN documents d ON s.document_id = d.id
        WHERE s.id = $1
        "#,
        share_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch share link: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Share link not found".to_string())),
    };

    // Check expiry
    if let Some(expires_at) = row.expires_at {
        if expires_at < Utc::now() {
            return Err(AppError::BadRequest("This share link has expired".to_string()));
        }
    }

    // Check download limit
    let downloads_count = row.downloads_count.unwrap_or(0);
    if let Some(limit) = row.download_limit {
        if downloads_count >= limit {
            return Err(AppError::BadRequest("This share link has reached its download limit".to_string()));
        }
    }

    Ok(Json(ShareLinkResponse {
        id: row.id,
        document_id: row.document_id,
        document_name: row.document_name,
        document_size: row.document_size,
        encrypted_dek: row.encrypted_dek,
        expires_at: row.expires_at,
        download_limit: row.download_limit,
        downloads_count,
        created_at: row.created_at,
        owner_encrypted_link_key: row.owner_encrypted_link_key,
    }))
}

/// Download a shared document (public, increments downloads_count)
pub async fn download_shared_document(
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<axum::body::Body, AppError> {
    let row = sqlx::query!(
        r#"
        SELECT s.document_id, s.expires_at, s.download_limit, s.downloads_count,
               d.storage_path
        FROM share_links s
        JOIN documents d ON s.document_id = d.id
        WHERE s.id = $1
        "#,
        share_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch share link for download: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Share link not found".to_string())),
    };

    // Check expiry
    if let Some(expires_at) = row.expires_at {
        if expires_at < Utc::now() {
            return Err(AppError::BadRequest("This share link has expired".to_string()));
        }
    }

    // Check download limit
    let downloads_count = row.downloads_count.unwrap_or(0);
    if let Some(limit) = row.download_limit {
        if downloads_count >= limit {
            return Err(AppError::BadRequest("This share link has reached its download limit".to_string()));
        }
    }

    // Increment downloads count
    sqlx::query!(
        "UPDATE share_links SET downloads_count = downloads_count + 1 WHERE id = $1",
        share_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to increment download count: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let file = tokio::fs::File::open(&row.storage_path).await.map_err(|e| {
        tracing::error!("File not found on disk: {} ({})", row.storage_path, e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    Ok(body)
}

/// Revoke a share link (delete it)
pub async fn revoke_share_link(
    session: AuthSession,
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query!(
        "DELETE FROM share_links WHERE id = $1 AND owner_id = $2",
        share_id,
        session.user_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to delete share link: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Share link not found or unauthorized".to_string()));
    }

    Ok(Json(serde_json::json!({
        "message": "Share link revoked successfully"
    })))
}

/// List all share links created by the authenticated user
pub async fn list_my_share_links(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<ShareLinkResponse>>, AppError> {
    let rows = sqlx::query!(
        r#"
        SELECT s.id, s.document_id, s.encrypted_dek, s.expires_at, s.download_limit, s.downloads_count, s.created_at, s.owner_encrypted_link_key,
               d.name AS document_name, d.size AS document_size
        FROM share_links s
        JOIN documents d ON s.document_id = d.id
        WHERE s.owner_id = $1
        ORDER BY s.created_at DESC
        "#,
        session.user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list my share links: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let shares = rows.into_iter().map(|r| ShareLinkResponse {
        id: r.id,
        document_id: r.document_id,
        document_name: r.document_name,
        document_size: r.document_size,
        encrypted_dek: r.encrypted_dek,
        expires_at: r.expires_at,
        downloads_count: r.downloads_count.unwrap_or(0),
        download_limit: r.download_limit,
        created_at: r.created_at,
        owner_encrypted_link_key: r.owner_encrypted_link_key,
    }).collect();

    Ok(Json(shares))
}
