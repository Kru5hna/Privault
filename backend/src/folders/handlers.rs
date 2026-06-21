use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use sqlx::Row;
use uuid::Uuid;

use super::models::FolderMetadata;
use crate::{auth::AuthSession, error::AppError, AppState};

#[derive(Deserialize)]
pub struct CreateFolderRequest {
    pub name: String,
    pub parent_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct RenameFolderRequest {
    pub name: String,
}

#[derive(Deserialize)]
pub struct ListFoldersQuery {
    pub parent_id: Option<Uuid>,
}

/// Create a new folder
pub async fn create_folder(
    session: AuthSession,
    State(state): State<AppState>,
    Json(payload): Json<CreateFolderRequest>,
) -> Result<Json<FolderMetadata>, AppError> {
    if payload.name.is_empty() {
        return Err(AppError::BadRequest("Folder name cannot be empty".to_string()));
    }

    // Insert folder metadata into DB
    let folder = sqlx::query_as::<_, FolderMetadata>(
        r#"
        INSERT INTO folders (owner_id, parent_id, name)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, parent_id, name, created_at
        "#,
    )
    .bind(session.user_id)
    .bind(payload.parent_id)
    .bind(payload.name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert folder: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(folder))
}

/// List folders (optionally scoped to a parent)
pub async fn list_folders(
    session: AuthSession,
    Query(query): Query<ListFoldersQuery>,
    State(state): State<AppState>,
) -> Result<Json<Vec<FolderMetadata>>, AppError> {
    // If parent_id is Some(uuid), we query WHERE parent_id = uuid.
    // If parent_id is None, we query WHERE parent_id IS NULL (root level folders).
    let folders = match query.parent_id {
        Some(pid) => {
            sqlx::query_as::<_, FolderMetadata>(
                r#"
                SELECT id, owner_id, parent_id, name, created_at
                FROM folders
                WHERE owner_id = $1 AND parent_id = $2 AND deleted_at IS NULL
                ORDER BY name ASC
                "#,
            )
            .bind(session.user_id)
            .bind(pid)
            .fetch_all(&state.db)
            .await
        }
        None => {
            sqlx::query_as::<_, FolderMetadata>(
                r#"
                SELECT id, owner_id, parent_id, name, created_at
                FROM folders
                WHERE owner_id = $1 AND parent_id IS NULL AND deleted_at IS NULL
                ORDER BY name ASC
                "#,
            )
            .bind(session.user_id)
            .fetch_all(&state.db)
            .await
        }
    }
    .map_err(|e| {
        tracing::error!("Failed to list folders: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(folders))
}

/// Soft-delete a folder and all its contents recursively (move to trash)
pub async fn delete_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify ownership
    let exists = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL",
    )
    .bind(folder_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await?;

    if exists.is_none() {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    // 1. Soft-delete the folder and all sub-folders recursively
    // Save original parent_id before soft-deleting
    sqlx::query(
        r#"
        UPDATE folders
        SET deleted_at = NOW(),
            trash_origin_parent_id = parent_id
        WHERE id = $1 AND owner_id = $2
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    // Recursively soft-delete sub-folders
    sqlx::query(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
            WHERE f.owner_id = $2 AND f.deleted_at IS NULL
        )
        UPDATE folders f
        SET deleted_at = NOW(),
            trash_origin_parent_id = f.parent_id
        FROM subfolders s
        WHERE f.id = s.id AND f.id != $1
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    // 2. Soft-delete all documents in the folder tree
    sqlx::query(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
            WHERE f.deleted_at IS NOT NULL
        )
        UPDATE documents d
        SET deleted_at = NOW(),
            trash_origin_folder_id = d.folder_id
        FROM subfolders s
        WHERE d.folder_id = s.id
          AND d.owner_id = $2
          AND d.deleted_at IS NULL
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "message": "Folder and contents moved to trash"
    })))
}

#[derive(serde::Serialize)]
pub struct FolderStats {
    pub file_count: i64,
    pub subfolder_count: i64,
}

/// Get folder statistics (recursive file and subfolder counts)
pub async fn get_folder_stats(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<FolderStats>, AppError> {
    // Check if folder exists and belongs to user
    let folder_exists = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL",
    )
    .bind(folder_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await?;

    if folder_exists.is_none() {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    // Count subfolders and files recursively
    let row = sqlx::query(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
            WHERE f.deleted_at IS NULL
        )
        SELECT 
            (SELECT COUNT(*) FROM documents WHERE folder_id IN (SELECT id FROM subfolders) AND deleted_at IS NULL) AS file_count,
            (SELECT COUNT(*) - 1 FROM subfolders) AS subfolder_count
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error counting folder contents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let file_count: i64 = row.get("file_count");
    let subfolder_count: i64 = row.get("subfolder_count");

    Ok(Json(FolderStats {
        file_count,
        subfolder_count,
    }))
}

/// Rename a folder
pub async fn rename_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<RenameFolderRequest>,
) -> Result<Json<FolderMetadata>, AppError> {
    if payload.name.is_empty() {
        return Err(AppError::BadRequest("Folder name cannot be empty".to_string()));
    }

    let folder = sqlx::query_as::<_, FolderMetadata>(
        r#"
        UPDATE folders 
        SET name = $1 
        WHERE id = $2 AND owner_id = $3 AND deleted_at IS NULL
        RETURNING id, owner_id, parent_id, name, created_at
        "#,
    )
    .bind(payload.name)
    .bind(folder_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error renaming folder: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    match folder {
        Some(f) => Ok(Json(f)),
        None => Err(AppError::NotFound("Folder not found".to_string())),
    }
}

/// List all folders owned by the logged-in user
pub async fn list_all_folders(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<FolderMetadata>>, AppError> {
    let folders = sqlx::query_as::<_, FolderMetadata>(
        r#"
        SELECT id, owner_id, parent_id, name, created_at
        FROM folders
        WHERE owner_id = $1 AND deleted_at IS NULL
        ORDER BY name ASC
        "#,
    )
    .bind(session.user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list all folders: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(folders))
}

