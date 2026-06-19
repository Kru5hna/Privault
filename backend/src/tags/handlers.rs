use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use super::models::TagMetadata;
use crate::{auth::AuthSession, error::AppError, AppState};

#[derive(Deserialize)]
pub struct CreateTagRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Deserialize)]
pub struct TagDocumentRequest {
    pub tag_id: Uuid,
}

/// Create a new tag
pub async fn create_tag(
    session: AuthSession,
    State(state): State<AppState>,
    Json(payload): Json<CreateTagRequest>,
) -> Result<Json<TagMetadata>, AppError> {
    if payload.name.is_empty() {
        return Err(AppError::BadRequest("Tag name cannot be empty".to_string()));
    }

    let color = payload.color.unwrap_or_else(|| "#E41613".to_string());

    let tag = sqlx::query_as!(
        TagMetadata,
        r#"
        INSERT INTO tags (owner_id, name, color)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, name, color, created_at
        "#,
        session.user_id,
        payload.name,
        color
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        // If it's a unique constraint violation
        if let sqlx::Error::Database(db_err) = &e {
            if db_err.is_unique_violation() {
                return AppError::Conflict("Tag already exists".to_string());
            }
        }
        tracing::error!("Failed to insert tag: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(tag))
}

/// List all tags for the user
pub async fn list_tags(
    session: AuthSession,
    State(state): State<AppState>,
) -> Result<Json<Vec<TagMetadata>>, AppError> {
    let tags = sqlx::query_as!(
        TagMetadata,
        r#"
        SELECT id, owner_id, name, color, created_at
        FROM tags
        WHERE owner_id = $1
        ORDER BY name ASC
        "#,
        session.user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list tags: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(tags))
}

/// Delete a tag
pub async fn delete_tag(
    session: AuthSession,
    Path(tag_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query!(
        r#"
        DELETE FROM tags 
        WHERE id = $1 AND owner_id = $2
        "#,
        tag_id,
        session.user_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error deleting tag: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Tag not found".to_string()));
    }

    Ok(Json(serde_json::json!({
        "message": "Tag deleted successfully"
    })))
}

/// Attach a tag to a document
pub async fn tag_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
    Json(payload): Json<TagDocumentRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 1. Verify user owns the document
    let doc = sqlx::query!("SELECT id FROM documents WHERE id = $1 AND owner_id = $2", doc_id, session.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| AppError::Internal(anyhow::anyhow!("DB Error")))?;

    if doc.is_none() {
        return Err(AppError::NotFound("Document not found".to_string()));
    }

    // 2. Verify user owns the tag
    let tag = sqlx::query!("SELECT id FROM tags WHERE id = $1 AND owner_id = $2", payload.tag_id, session.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| AppError::Internal(anyhow::anyhow!("DB Error")))?;

    if tag.is_none() {
        return Err(AppError::NotFound("Tag not found".to_string()));
    }

    // 3. Insert relationship
    sqlx::query!(
        r#"
        INSERT INTO document_tags (document_id, tag_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
        doc_id,
        payload.tag_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to tag document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(serde_json::json!({"message": "Document tagged"})))
}

/// Remove a tag from a document
pub async fn untag_document(
    session: AuthSession,
    Path((doc_id, tag_id)): Path<(Uuid, Uuid)>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    // 1. Verify user owns the document
    let doc = sqlx::query!("SELECT id FROM documents WHERE id = $1 AND owner_id = $2", doc_id, session.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| AppError::Internal(anyhow::anyhow!("DB Error")))?;

    if doc.is_none() {
        return Err(AppError::NotFound("Document not found".to_string()));
    }

    // 2. Delete relationship
    sqlx::query!(
        r#"
        DELETE FROM document_tags 
        WHERE document_id = $1 AND tag_id = $2
        "#,
        doc_id,
        tag_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to untag document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(serde_json::json!({"message": "Tag removed from document"})))
}

/// List all tags for a specific document
pub async fn list_document_tags(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<Vec<TagMetadata>>, AppError> {
    // 1. Verify user owns the document
    let doc = sqlx::query!("SELECT id FROM documents WHERE id = $1 AND owner_id = $2", doc_id, session.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|_| AppError::Internal(anyhow::anyhow!("DB Error")))?;

    if doc.is_none() {
        return Err(AppError::NotFound("Document not found".to_string()));
    }

    // 2. Fetch tags
    let tags = sqlx::query_as!(
        TagMetadata,
        r#"
        SELECT t.id, t.owner_id, t.name, t.color, t.created_at
        FROM tags t
        JOIN document_tags dt ON t.id = dt.tag_id
        WHERE dt.document_id = $1
        ORDER BY t.name ASC
        "#,
        doc_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to list document tags: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(tags))
}
