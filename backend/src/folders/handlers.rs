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

/// Delete a folder (and cascade delete its contents via DB constraint)
pub async fn delete_folder(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query!(
        r#"
        DELETE FROM folders 
        WHERE id = $1 AND owner_id = $2
        "#,
        folder_id,
        session.user_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error deleting folder: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Folder not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "message": "Folder deleted successfully"
    })))
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
