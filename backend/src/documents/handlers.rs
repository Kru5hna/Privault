use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use tokio::fs::{remove_file, File};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use serde::Deserialize;
use super::models::DocumentMetadata;
use crate::{auth::AuthSession, error::AppError, AppState};

#[derive(Deserialize)]
pub struct ListDocumentsQuery {
    pub folder_id: Option<Uuid>,
}

/// Upload an encrypted document
pub async fn upload_document(
    session: AuthSession,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    let mut name = String::new();
    let mut encrypted_dek = String::new();
    let mut file_bytes = Vec::new();
    let mut folder_id: Option<Uuid> = None;

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "name" {
            name = field.text().await.unwrap_or_default();
        } else if field_name == "encrypted_dek" {
            encrypted_dek = field.text().await.unwrap_or_default();
        } else if field_name == "file" {
            file_bytes = field.bytes().await.unwrap_or_default().to_vec();
        } else if field_name == "folder_id" {
            if let Ok(fid) = Uuid::parse_str(&field.text().await.unwrap_or_default()) {
                folder_id = Some(fid);
            }
        }
    }

    if name.is_empty() || encrypted_dek.is_empty() || file_bytes.is_empty() {
        return Err(AppError::BadRequest(
            "Missing required fields: file, name, encrypted_dek".to_string(),
        ));
    }

    let doc_id = Uuid::new_v4();
    let storage_path = format!("uploads/{}", doc_id);

    // Write file to local disk
    let mut file = File::create(&storage_path).await.map_err(|e| {
        tracing::error!("Failed to create file: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    file.write_all(&file_bytes).await.map_err(|e| {
        tracing::error!("Failed to write file bytes: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let size = file_bytes.len() as i64;

    // Insert document metadata into DB
    sqlx::query!(
        r#"
        INSERT INTO documents (id, owner_id, name, encrypted_dek, storage_path, size, folder_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
        doc_id,
        session.user_id,
        name,
        encrypted_dek,
        storage_path,
        size,
        folder_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert document metadata: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(serde_json::json!({
        "id": doc_id,
        "message": "Document uploaded successfully"
    })))
}

/// List all documents owned by the logged-in user
pub async fn list_documents(
    session: AuthSession,
    Query(query): Query<ListDocumentsQuery>,
    State(state): State<AppState>,
) -> Result<Json<Vec<DocumentMetadata>>, AppError> {
    let docs = match query.folder_id {
        Some(fid) => {
            sqlx::query_as!(
                DocumentMetadata,
                r#"
                SELECT id, name, encrypted_dek, size, folder_id, created_at
                FROM documents
                WHERE owner_id = $1 AND folder_id = $2
                ORDER BY created_at DESC
                "#,
                session.user_id,
                fid
            )
            .fetch_all(&state.db)
            .await
        }
        None => {
            sqlx::query_as!(
                DocumentMetadata,
                r#"
                SELECT id, name, encrypted_dek, size, folder_id, created_at
                FROM documents
                WHERE owner_id = $1 AND folder_id IS NULL
                ORDER BY created_at DESC
                "#,
                session.user_id
            )
            .fetch_all(&state.db)
            .await
        }
    }
    .map_err(|e| {
        tracing::error!("Failed to list documents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(docs))
}

/// Download raw encrypted document bytes
pub async fn download_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<axum::body::Body, AppError> {
    // Verify ownership and get storage path
    let doc = sqlx::query!(
        r#"
        SELECT storage_path FROM documents
        WHERE id = $1 AND owner_id = $2
        "#,
        doc_id,
        session.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error during download: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let doc = match doc {
        Some(d) => d,
        None => return Err(AppError::NotFound("Document not found".to_string())),
    };

    let file = tokio::fs::File::open(&doc.storage_path).await.map_err(|e| {
        tracing::error!("File not found on disk: {} ({})", doc.storage_path, e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    Ok(body)
}

/// Delete a document (DB and Disk)
pub async fn delete_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify ownership and get storage path
    let doc = sqlx::query!(
        r#"
        SELECT storage_path FROM documents
        WHERE id = $1 AND owner_id = $2
        "#,
        doc_id,
        session.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error during delete: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let doc = match doc {
        Some(d) => d,
        None => return Err(AppError::NotFound("Document not found".to_string())),
    };

    // Delete from DB
    sqlx::query!(
        r#"
        DELETE FROM documents WHERE id = $1
        "#,
        doc_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error deleting document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // Delete from disk
    if let Err(e) = remove_file(&doc.storage_path).await {
        tracing::warn!("Failed to delete file from disk: {}. Error: {}", doc.storage_path, e);
    }

    Ok(Json(serde_json::json!({
        "message": "Document deleted successfully"
    })))
}
