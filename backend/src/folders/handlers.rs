use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
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
    let folder = sqlx::query_as!(
        FolderMetadata,
        r#"
        INSERT INTO folders (owner_id, parent_id, name)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, parent_id, name, created_at
        "#,
        session.user_id,
        payload.parent_id,
        payload.name
    )
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
            sqlx::query_as!(
                FolderMetadata,
                r#"
                SELECT id, owner_id, parent_id, name, created_at
                FROM folders
                WHERE owner_id = $1 AND parent_id = $2
                ORDER BY name ASC
                "#,
                session.user_id,
                pid
            )
            .fetch_all(&state.db)
            .await
        }
        None => {
            sqlx::query_as!(
                FolderMetadata,
                r#"
                SELECT id, owner_id, parent_id, name, created_at
                FROM folders
                WHERE owner_id = $1 AND parent_id IS NULL
                ORDER BY name ASC
                "#,
                session.user_id
            )
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

/// Delete a folder and all its contents recursively
pub async fn delete_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut tx = state.db.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // 1. Find all documents in the folder and its subfolders
    let docs = sqlx::query!(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
        )
        SELECT id, storage_path FROM documents
        WHERE folder_id IN (SELECT id FROM subfolders)
        "#,
        folder_id,
        session.user_id
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("DB error finding documents for folder delete: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // 2. Delete documents from database
    sqlx::query!(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
        )
        DELETE FROM documents
        WHERE folder_id IN (SELECT id FROM subfolders)
        "#,
        folder_id,
        session.user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("DB error deleting documents for folder delete: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // 3. Delete the folder itself (cascade deletes subfolders)
    let result = sqlx::query!(
        r#"
        DELETE FROM folders 
        WHERE id = $1 AND owner_id = $2
        "#,
        folder_id,
        session.user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("DB error deleting folder: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // 4. Delete physical files from disk
    for doc in docs {
        if let Err(e) = tokio::fs::remove_file(&doc.storage_path).await {
            tracing::warn!("Failed to delete file from disk: {}. Error: {}", doc.storage_path, e);
        }
    }

    Ok(Json(serde_json::json!({
        "message": "Folder and contents deleted successfully"
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
    let folder_exists = sqlx::query!(
        "SELECT id FROM folders WHERE id = $1 AND owner_id = $2",
        folder_id,
        session.user_id
    )
    .fetch_optional(&state.db)
    .await?;

    if folder_exists.is_none() {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    // Count subfolders and files recursively
    let stats = sqlx::query!(
        r#"
        WITH RECURSIVE subfolders AS (
            SELECT id FROM folders WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT f.id FROM folders f
            JOIN subfolders sf ON f.parent_id = sf.id
        )
        SELECT 
            (SELECT COUNT(*) FROM documents WHERE folder_id IN (SELECT id FROM subfolders)) as "file_count!",
            (SELECT COUNT(*) - 1 FROM subfolders) as "subfolder_count!"
        "#,
        folder_id,
        session.user_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error counting folder contents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(FolderStats {
        file_count: stats.file_count,
        subfolder_count: stats.subfolder_count,
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

    let folder = sqlx::query_as!(
        FolderMetadata,
        r#"
        UPDATE folders 
        SET name = $1 
        WHERE id = $2 AND owner_id = $3
        RETURNING id, owner_id, parent_id, name, created_at
        "#,
        payload.name,
        folder_id,
        session.user_id
    )
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
    let folders = sqlx::query_as!(
        FolderMetadata,
        r#"
        SELECT id, owner_id, parent_id, name, created_at
        FROM folders
        WHERE owner_id = $1
        ORDER BY name ASC
        "#,
        session.user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list all folders: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(folders))
}

