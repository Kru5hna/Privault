use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use crate::{audit, auth::AuthSession, error::AppError, AppState};
use super::models::ShareLinkResponse;

#[derive(Deserialize)]
pub struct CreateShareLinkPayload {
    pub document_id: Uuid,
    pub encrypted_dek: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub download_limit: Option<i32>,
    pub owner_encrypted_link_key: Option<String>,
    #[serde(default = "default_permission")]
    pub permission: String,
}

fn default_permission() -> String {
    "download_allowed".to_string()
}

/// Create a new cryptographic share link for a document
pub async fn create_share_link(
    session: AuthSession,
    State(state): State<AppState>,
    Json(payload): Json<CreateShareLinkPayload>,
) -> Result<Json<ShareLinkResponse>, AppError> {
    // Verify document ownership (exclude soft-deleted)
    let doc_row = sqlx::query(
        "SELECT name, size FROM documents WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL",
    )
    .bind(payload.document_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error verifying document ownership: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let doc_row = match doc_row {
        Some(d) => d,
        None => return Err(AppError::Unauthorized("You do not own this document".to_string())),
    };
    let doc_name: String = doc_row.get("name");
    let doc_size: i64 = doc_row.get("size");

    // Validate permission value
    if payload.permission != "view_only" && payload.permission != "download_allowed" {
        return Err(AppError::BadRequest(
            "Permission must be 'view_only' or 'download_allowed'".to_string(),
        ));
    }

    let share_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO share_links (id, document_id, owner_id, encrypted_dek, expires_at, download_limit, owner_encrypted_link_key, permission)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(share_id)
    .bind(payload.document_id)
    .bind(session.user_id)
    .bind(&payload.encrypted_dek)
    .bind(payload.expires_at)
    .bind(payload.download_limit)
    .bind(&payload.owner_encrypted_link_key)
    .bind(&payload.permission)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert share link: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_SHARE_CREATED,
        Some(audit::RESOURCE_SHARE_LINK),
        Some(share_id),
        Some(audit::detail([
            ("document_id", payload.document_id.to_string()),
            ("permission", payload.permission.clone()),
        ])),
        None,
    ).await;

    Ok(Json(ShareLinkResponse {
        id: share_id,
        document_id: payload.document_id,
        document_name: doc_name,
        document_size: doc_size,
        encrypted_dek: payload.encrypted_dek,
        expires_at: payload.expires_at,
        download_limit: payload.download_limit,
        downloads_count: 0,
        created_at: Some(Utc::now()),
        owner_encrypted_link_key: payload.owner_encrypted_link_key,
        permission: payload.permission,
    }))
}

/// Get public metadata of a share link
pub async fn get_share_link(
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<ShareLinkResponse>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT s.id, s.document_id, s.encrypted_dek, s.expires_at,
               s.download_limit, s.downloads_count, s.created_at,
               s.owner_encrypted_link_key, s.permission,
               d.name AS document_name, d.size AS document_size
        FROM share_links s
        JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
        WHERE s.id = $1
        "#,
    )
    .bind(share_id)
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
    let expires_at: Option<DateTime<Utc>> = row.get("expires_at");
    if let Some(expires) = expires_at {
        if expires < Utc::now() {
            return Err(AppError::BadRequest("This share link has expired".to_string()));
        }
    }

    // Check download limit
    let downloads_count: i32 = row.get("downloads_count");
    let download_limit: Option<i32> = row.get("download_limit");
    if let Some(limit) = download_limit {
        if downloads_count >= limit {
            return Err(AppError::BadRequest("This share link has reached its download limit".to_string()));
        }
    }

    Ok(Json(ShareLinkResponse {
        id: row.get("id"),
        document_id: row.get("document_id"),
        document_name: row.get("document_name"),
        document_size: row.get("document_size"),
        encrypted_dek: row.get("encrypted_dek"),
        expires_at,
        download_limit,
        downloads_count,
        created_at: row.get("created_at"),
        owner_encrypted_link_key: row.get("owner_encrypted_link_key"),
        permission: row.get("permission"),
    }))
}

/// Download a shared document (public, increments downloads_count)
pub async fn download_shared_document(
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<axum::body::Body, AppError> {
    let row = sqlx::query(
        r#"
        SELECT s.document_id, s.expires_at, s.download_limit, s.downloads_count,
               s.permission, d.storage_path
        FROM share_links s
        JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
        WHERE s.id = $1
        "#,
    )
    .bind(share_id)
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
    let expires_at: Option<DateTime<Utc>> = row.get("expires_at");
    if let Some(expires) = expires_at {
        if expires < Utc::now() {
            return Err(AppError::BadRequest("This share link has expired".to_string()));
        }
    }

    // Check download limit
    let downloads_count: i32 = row.get("downloads_count");
    let download_limit: Option<i32> = row.get("download_limit");
    if let Some(limit) = download_limit {
        if downloads_count >= limit {
            return Err(AppError::BadRequest("This share link has reached its download limit".to_string()));
        }
    }

    // Enforce permission
    let permission: String = row.get("permission");
    if permission == "view_only" {
        return Err(AppError::BadRequest(
            "This share link is view-only. Downloading is not permitted.".to_string(),
        ));
    }

    // Increment downloads count
    sqlx::query(
        "UPDATE share_links SET downloads_count = downloads_count + 1 WHERE id = $1",
    )
    .bind(share_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to increment download count: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let storage_path: String = row.get("storage_path");
    let bytes = state.storage.download_bytes(&storage_path).await.map_err(|e| {
        tracing::error!("File not found on S3: {} ({})", storage_path, e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let body = axum::body::Body::from(bytes);

    Ok(body)
}

/// Revoke a share link (delete it)
pub async fn revoke_share_link(
    session: AuthSession,
    Path(share_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        "DELETE FROM share_links WHERE id = $1 AND owner_id = $2",
    )
    .bind(share_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to delete share link: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Share link not found or unauthorized".to_string()));
    }

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_SHARE_REVOKED,
        Some(audit::RESOURCE_SHARE_LINK),
        Some(share_id),
        None,
        None,
    ).await;

    Ok(Json(serde_json::json!({
        "message": "Share link revoked successfully"
    })))
}

/// List all share links created by the authenticated user
pub async fn list_my_share_links(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<ShareLinkResponse>>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT s.id, s.document_id, s.encrypted_dek, s.expires_at,
               s.download_limit, s.downloads_count, s.created_at,
               s.owner_encrypted_link_key, s.permission,
               d.name AS document_name, d.size AS document_size
        FROM share_links s
        JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
        WHERE s.owner_id = $1
        ORDER BY s.created_at DESC
        "#,
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list my share links: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let shares = rows.into_iter().map(|r| {
        ShareLinkResponse {
            id: r.get("id"),
            document_id: r.get("document_id"),
            document_name: r.get("document_name"),
            document_size: r.get("document_size"),
            encrypted_dek: r.get("encrypted_dek"),
            expires_at: r.get("expires_at"),
            downloads_count: r.get("downloads_count"),
            download_limit: r.get("download_limit"),
            created_at: r.get("created_at"),
            owner_encrypted_link_key: r.get("owner_encrypted_link_key"),
            permission: r.get("permission"),
        }
    }).collect();

    Ok(Json(shares))
}
