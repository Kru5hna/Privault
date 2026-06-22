use axum::{
    extract::{Path, State},
    Json,
};
use chrono::Utc;
use sqlx::Row;
use uuid::Uuid;

use super::models::*;
use crate::{auth::AuthSession, error::AppError, AppState};

/// List all trashed documents and folders for the current user.
pub async fn list_trash(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<TrashListResponse>, AppError> {
    let retention_days = std::env::var("TRASH_RETENTION_DAYS")
        .ok()
        .and_then(|d| d.parse::<i64>().ok())
        .unwrap_or(30);

    // Trashed documents
    let doc_rows = sqlx::query(
        r#"
        SELECT id, name, size, mime_type,
               trash_origin_folder_id AS original_folder_id,
               deleted_at
        FROM documents
        WHERE owner_id = $1 AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
        "#,
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list trashed documents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let now = Utc::now();
    let documents: Vec<TrashedDocument> = doc_rows
        .into_iter()
        .map(|r| {
            let deleted_at: chrono::DateTime<chrono::Utc> = r.get("deleted_at");
            let elapsed = (now - deleted_at).num_days();
            TrashedDocument {
                id: r.get("id"),
                name: r.get("name"),
                size: r.get("size"),
                mime_type: r.get("mime_type"),
                original_folder_id: r.get("original_folder_id"),
                deleted_at,
                days_left: (retention_days - elapsed).max(0),
            }
        })
        .collect();

    // Trashed folders
    let folder_rows = sqlx::query(
        r#"
        SELECT f.id, f.name, f.trash_origin_parent_id AS original_parent_id,
               f.deleted_at,
               (SELECT COUNT(*) FROM documents d WHERE d.trash_origin_folder_id = f.id AND d.deleted_at IS NOT NULL) AS file_count,
               (SELECT COUNT(*) FROM folders sf WHERE sf.trash_origin_parent_id = f.id AND sf.deleted_at IS NOT NULL) AS subfolder_count
        FROM folders f
        WHERE f.owner_id = $1 AND f.deleted_at IS NOT NULL
        ORDER BY f.deleted_at DESC
        "#,
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list trashed folders: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let folders: Vec<TrashedFolder> = folder_rows
        .into_iter()
        .map(|r| {
            let deleted_at: chrono::DateTime<chrono::Utc> = r.get("deleted_at");
            let elapsed = (now - deleted_at).num_days();
            TrashedFolder {
                id: r.get("id"),
                name: r.get("name"),
                original_parent_id: r.get("original_parent_id"),
                deleted_at,
                days_left: (retention_days - elapsed).max(0),
                file_count: r.get("file_count"),
                subfolder_count: r.get("subfolder_count"),
            }
        })
        .collect();

    let total_count = documents.len() + folders.len();

    Ok(Json(TrashListResponse {
        documents,
        folders,
        total_count,
    }))
}

/// Restore a trashed document to its original folder.
pub async fn restore_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        r#"
        UPDATE documents
        SET deleted_at = NULL,
            folder_id = trash_origin_folder_id
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to restore document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trashed document not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "message": "Document restored successfully"
    })))
}

/// Restore a trashed folder and all its contents recursively.
pub async fn restore_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Restore the folder itself
    let result = sqlx::query(
        r#"
        UPDATE folders
        SET deleted_at = NULL,
            parent_id = trash_origin_parent_id
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to restore folder: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Trashed folder not found".to_string()));
    }

    // Restore all documents that were in this folder
    sqlx::query(
        r#"
        UPDATE documents
        SET deleted_at = NULL,
            folder_id = trash_origin_folder_id
        WHERE owner_id = $1
          AND deleted_at IS NOT NULL
          AND trash_origin_folder_id = $2
        "#,
    )
    .bind(session.user_id)
    .bind(folder_id)
    .execute(&state.db)
    .await?;

    // Recursively restore sub-folders
    sqlx::query(
        r#"
        WITH RECURSIVE restore_tree AS (
            SELECT id, trash_origin_parent_id FROM folders
            WHERE trash_origin_parent_id = $2 AND owner_id = $1 AND deleted_at IS NOT NULL
            UNION ALL
            SELECT f.id, f.trash_origin_parent_id FROM folders f
            JOIN restore_tree rt ON f.trash_origin_parent_id = rt.id
            WHERE f.owner_id = $1 AND f.deleted_at IS NOT NULL
        )
        UPDATE folders f
        SET deleted_at = NULL,
            parent_id = f.trash_origin_parent_id
        FROM restore_tree rt
        WHERE f.id = rt.id
        "#,
    )
    .bind(session.user_id)
    .bind(folder_id)
    .execute(&state.db)
    .await?;

    // Restore documents in sub-folders
    sqlx::query(
        r#"
        UPDATE documents d
        SET deleted_at = NULL,
            folder_id = d.trash_origin_folder_id
        WHERE d.owner_id = $1
          AND d.deleted_at IS NOT NULL
          AND d.trash_origin_folder_id IN (
              WITH RECURSIVE subfolders AS (
                  SELECT id FROM folders WHERE id = $2
                  UNION ALL
                  SELECT f.id FROM folders f
                  JOIN subfolders sf ON f.trash_origin_parent_id = sf.id
                  WHERE f.deleted_at IS NOT NULL
              )
              SELECT id FROM subfolders
          )
        "#,
    )
    .bind(session.user_id)
    .bind(folder_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "message": "Folder and contents restored successfully"
    })))
}

/// Restore a generic item by type (document or folder).
pub async fn restore_item(
    session: AuthSession,
    Path((item_type, item_id)): Path<(String, Uuid)>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    match item_type.as_str() {
        "documents" => restore_document(session, Path(item_id), State(state)).await,
        "folders" => restore_folder(session, Path(item_id), State(state)).await,
        _ => Err(AppError::BadRequest(format!(
            "Invalid item type: {}. Must be 'documents' or 'folders'",
            item_type
        ))),
    }
}

/// Permanently delete a single trashed document.
pub async fn permanent_delete_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT storage_path FROM documents
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NOT NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error finding trashed document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Trashed document not found".to_string())),
    };

    let storage_path: String = row.get("storage_path");

    // Delete from DB
    sqlx::query("DELETE FROM documents WHERE id = $1 AND owner_id = $2")
        .bind(doc_id)
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    // Delete from S3
    if let Err(e) = state.storage.delete_object(&storage_path).await {
        tracing::warn!("Failed to delete file from S3: {} ({})", storage_path, e);
    }

    Ok(Json(serde_json::json!({
        "message": "Document permanently deleted"
    })))
}

/// Permanently delete a trashed folder and all its contents.
pub async fn permanent_delete_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Find all documents to delete from disk (current + subfolder documents)
    let doc_rows = sqlx::query(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.trash_origin_parent_id = sf.id
            WHERE f.owner_id = $2
        )
        SELECT storage_path FROM documents
        WHERE owner_id = $2
          AND deleted_at IS NOT NULL
          AND trash_origin_folder_id IN (SELECT id FROM subfolders)
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error finding folder contents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let paths: Vec<String> = doc_rows.iter().map(|r| r.get("storage_path")).collect();

    // Delete documents from DB
    sqlx::query(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.trash_origin_parent_id = sf.id
            WHERE f.owner_id = $2
        )
        DELETE FROM documents
        WHERE owner_id = $2
          AND deleted_at IS NOT NULL
          AND trash_origin_folder_id IN (SELECT id FROM subfolders)
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    // Delete sub-folders from DB (recursive)
    sqlx::query(
        r#"
        WITH RECURSIVE delete_tree AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN delete_tree dt ON f.trash_origin_parent_id = dt.id
            WHERE f.owner_id = $2
        )
        DELETE FROM folders WHERE id IN (SELECT id FROM delete_tree)
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    // Delete files from S3
    for path in &paths {
        if let Err(e) = state.storage.delete_object(path).await {
            tracing::warn!("Failed to delete file from S3: {} ({})", path, e);
        }
    }

    Ok(Json(serde_json::json!({
        "message": "Folder permanently deleted"
    })))
}

/// Permanently delete a generic item by type.
pub async fn permanent_delete_item(
    session: AuthSession,
    Path((item_type, item_id)): Path<(String, Uuid)>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    match item_type.as_str() {
        "documents" => permanent_delete_document(session, Path(item_id), State(state)).await,
        "folders" => permanent_delete_folder(session, Path(item_id), State(state)).await,
        _ => Err(AppError::BadRequest(format!(
            "Invalid item type: {}. Must be 'documents' or 'folders'",
            item_type
        ))),
    }
}

/// Empty the entire trash — permanently delete all trashed items.
pub async fn empty_trash(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Collect all file paths for disk cleanup
    let doc_rows = sqlx::query(
        "SELECT storage_path FROM documents WHERE owner_id = $1 AND deleted_at IS NOT NULL",
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await?;

    let paths: Vec<String> = doc_rows.iter().map(|r| r.get("storage_path")).collect();

    // Also get thumbnails
    let thumb_rows = sqlx::query(
        "SELECT thumbnail_path FROM documents WHERE owner_id = $1 AND deleted_at IS NOT NULL AND thumbnail_path IS NOT NULL",
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await?;

    let thumb_paths: Vec<String> = thumb_rows.iter().map(|r| r.get("thumbnail_path")).collect();

    // Delete all trashed documents
    sqlx::query("DELETE FROM documents WHERE owner_id = $1 AND deleted_at IS NOT NULL")
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    // Delete all trashed folders
    sqlx::query("DELETE FROM folders WHERE owner_id = $1 AND deleted_at IS NOT NULL")
        .bind(session.user_id)
        .execute(&state.db)
        .await?;

    // Delete files from S3
    for path in paths.iter().chain(thumb_paths.iter()) {
        if let Err(e) = state.storage.delete_object(path).await {
            tracing::warn!("Failed to delete file from S3 during empty trash: {} ({})", path, e);
        }
    }

    Ok(Json(serde_json::json!({
        "message": "Trash emptied successfully"
    })))
}

/// Cleanup expired trash items (items past retention period).
/// Called on server startup and periodically.
pub async fn cleanup_expired_trash(state: &AppState) {
    let retention_days = std::env::var("TRASH_RETENTION_DAYS")
        .ok()
        .and_then(|d| d.parse::<i64>().ok())
        .unwrap_or(30);

    tracing::info!("Running trash cleanup (retention: {} days)", retention_days);

    // Find expired documents
    let doc_rows = match sqlx::query(
        r#"
        SELECT storage_path FROM documents
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::TEXT || ' days')::INTERVAL
        "#,
    )
    .bind(retention_days.to_string())
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Trash cleanup query failed: {}", e);
            return;
        }
    };

    let paths: Vec<String> = doc_rows.iter().map(|r| r.get("storage_path")).collect();

    // Delete expired documents
    if let Err(e) = sqlx::query(
        r#"
        DELETE FROM documents
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::TEXT || ' days')::INTERVAL
        "#,
    )
    .bind(retention_days.to_string())
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to delete expired documents: {}", e);
    }

    // Delete expired folders
    if let Err(e) = sqlx::query(
        r#"
        DELETE FROM folders
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::TEXT || ' days')::INTERVAL
        "#,
    )
    .bind(retention_days.to_string())
    .execute(&state.db)
    .await
    {
        tracing::error!("Failed to delete expired folders: {}", e);
    }

    // Delete files from S3
    for path in paths {
        if let Err(e) = state.storage.delete_object(&path).await {
            tracing::warn!("Failed to delete expired file from S3: {} ({})", path, e);
        }
    }

    tracing::info!("Trash cleanup complete");
}
