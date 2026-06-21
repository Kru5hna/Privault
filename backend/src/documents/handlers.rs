use axum::{
    extract::{Multipart, Path, Query, State},
    Json,
};
use std::collections::BTreeMap;
use sqlx::{Postgres, Row, Transaction};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use serde::Deserialize;
use super::models::*;
use crate::{audit, auth::AuthSession, error::AppError, AppState};

/// Validate a MIME type string against known patterns.
/// Files are encrypted at rest, so the server cannot sniff contents.
/// We validate format and allowlist, but ultimately trust the client-provided value.
fn validate_mime_type(mime: &str) -> Result<(), AppError> {
    if mime.len() > 255 {
        return Err(AppError::BadRequest("MIME type too long (max 255 chars)".to_string()));
    }

    // Must match: type/subtype  (e.g. "application/pdf", "image/jpeg")
    let valid = mime.contains('/')
        && !mime.starts_with('/')
        && !mime.ends_with('/')
        && mime.chars().all(|c| c.is_alphanumeric() || c == '/' || c == '.' || c == '+' || c == '-');

    if !valid {
        return Err(AppError::BadRequest(format!("Invalid MIME type: {}", mime)));
    }

    Ok(())
}

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
    let mut mime_type = String::from("application/octet-stream");
    let mut file_bytes = Vec::new();
    let mut folder_id: Option<Uuid> = None;

    while let Some(field) = multipart.next_field().await? {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "name" {
            name = field.text().await.unwrap_or_default();
        } else if field_name == "encrypted_dek" {
            encrypted_dek = field.text().await.unwrap_or_default();
        } else if field_name == "mime_type" {
            let val = field.text().await.unwrap_or_default();
            if !val.is_empty() {
                mime_type = val;
            }
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

    validate_mime_type(&mime_type)?;

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
    sqlx::query(
        r#"
        INSERT INTO documents (id, owner_id, name, encrypted_dek, storage_path, size, mime_type, folder_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .bind(&name)
    .bind(&encrypted_dek)
    .bind(&storage_path)
    .bind(size)
    .bind(&mime_type)
    .bind(folder_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert document metadata: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_UPLOAD,
        Some(audit::RESOURCE_DOCUMENT),
        Some(doc_id),
        Some(serde_json::json!({"size": size, "name": name, "mime_type": mime_type})),
        None,
    ).await;

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
            sqlx::query_as::<_, DocumentMetadata>(
                r#"
                SELECT id, name, encrypted_dek, size, mime_type, folder_id, created_at,
                       thumbnail_path IS NOT NULL AS has_thumbnail
                FROM documents
                WHERE owner_id = $1 AND folder_id = $2 AND deleted_at IS NULL
                ORDER BY created_at DESC
                "#,
            )
            .bind(session.user_id)
            .bind(fid)
            .fetch_all(&state.db)
            .await
        }
        None => {
            sqlx::query_as::<_, DocumentMetadata>(
                r#"
                SELECT id, name, encrypted_dek, size, mime_type, folder_id, created_at,
                       thumbnail_path IS NOT NULL AS has_thumbnail
                FROM documents
                WHERE owner_id = $1 AND folder_id IS NULL AND deleted_at IS NULL
                ORDER BY created_at DESC
                "#,
            )
            .bind(session.user_id)
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

/// Get full document details for the preview screen.
pub async fn get_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<DocumentDetail>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT id, name, encrypted_dek, size, mime_type, folder_id,
               created_at, updated_at, thumbnail_path IS NOT NULL AS has_thumbnail
        FROM documents
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error fetching document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Document not found".to_string())),
    };

    let id: Uuid = row.get("id");
    let name: String = row.get("name");
    let encrypted_dek: String = row.get("encrypted_dek");
    let size: i64 = row.get("size");
    let mime_type: String = row.get("mime_type");
    let folder_id: Option<Uuid> = row.get("folder_id");
    let created_at: Option<chrono::DateTime<chrono::Utc>> = row.get("created_at");
    let updated_at: Option<chrono::DateTime<chrono::Utc>> = row.get("updated_at");
    let has_thumbnail: bool = row.get("has_thumbnail");

    // Fetch tags for this document
    let tags = sqlx::query_as::<_, crate::tags::models::TagMetadata>(
        r#"
        SELECT t.id, t.owner_id, t.name, t.color, t.created_at
        FROM tags t
        JOIN document_tags dt ON t.id = dt.tag_id
        WHERE dt.document_id = $1
        ORDER BY t.name ASC
        "#,
    )
    .bind(doc_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error fetching tags: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // Count active share links
    let share_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*) FROM share_links
        WHERE document_id = $1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (download_limit IS NULL OR downloads_count < download_limit)
        "#,
    )
    .bind(doc_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error counting shares: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(DocumentDetail {
        id,
        name,
        encrypted_dek,
        size,
        mime_type,
        folder_id,
        created_at,
        updated_at,
        has_thumbnail,
        tags,
        share_count,
    }))
}

/// Upload an encrypted thumbnail for a document.
/// The frontend generates the thumbnail from the decrypted file,
/// then encrypts it (same DEK) and uploads the encrypted bytes here.
pub async fn upload_thumbnail(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify document ownership
    let owner: Option<Uuid> = sqlx::query_scalar(
        "SELECT owner_id FROM documents WHERE id = $1",
    )
    .bind(doc_id)
    .fetch_optional(&state.db)
    .await?;

    match owner {
        Some(oid) if oid == session.user_id => {}
        _ => return Err(AppError::NotFound("Document not found".to_string())),
    }

    // Read the thumbnail file from multipart
    let mut thumbnail_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart.next_field().await? {
        if field.name().unwrap_or("") == "file" {
            thumbnail_bytes = Some(field.bytes().await.map_err(|_| {
                AppError::BadRequest("Failed to read thumbnail file".to_string())
            })?.to_vec());
        }
    }

    let data = match thumbnail_bytes {
        Some(d) if !d.is_empty() => d,
        _ => return Err(AppError::BadRequest("Missing thumbnail file".to_string())),
    };

    // Write thumbnail to disk
    let thumbnail_path = format!("thumbnails/{}", doc_id);
    tokio::fs::write(&thumbnail_path, &data).await.map_err(|e| {
        tracing::error!("Failed to write thumbnail: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    // Update document record
    sqlx::query(
        "UPDATE documents SET thumbnail_path = $1, thumbnail_updated_at = NOW() WHERE id = $2",
    )
    .bind(&thumbnail_path)
    .bind(doc_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update thumbnail path: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    tokio::fs::create_dir_all("thumbnails").await.ok();

    Ok(Json(serde_json::json!({
        "message": "Thumbnail uploaded successfully"
    })))
}

/// Download an encrypted thumbnail for a document.
pub async fn download_thumbnail(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<axum::body::Body, AppError> {
    let row = sqlx::query(
        r#"
        SELECT thumbnail_path FROM documents
        WHERE id = $1 AND owner_id = $2 AND thumbnail_path IS NOT NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error fetching thumbnail: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Thumbnail not found".to_string())),
    };

    let thumbnail_path: String = row.get("thumbnail_path");

    let file = tokio::fs::File::open(&thumbnail_path).await.map_err(|e| {
        tracing::error!("Thumbnail file not found: {} ({})", thumbnail_path, e);
        AppError::NotFound("Thumbnail file not found".to_string())
    })?;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    Ok(body)
}

/// Delete a thumbnail for a document.
pub async fn delete_thumbnail(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query(
        r#"
        SELECT thumbnail_path FROM documents
        WHERE id = $1 AND owner_id = $2 AND thumbnail_path IS NOT NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error fetching thumbnail for delete: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Thumbnail not found".to_string())),
    };

    let thumbnail_path: String = row.get("thumbnail_path");

    // Delete from disk
    if let Err(e) = tokio::fs::remove_file(&thumbnail_path).await {
        tracing::warn!("Failed to delete thumbnail file: {} ({})", thumbnail_path, e);
    }

    // Clear DB fields
    sqlx::query(
        "UPDATE documents SET thumbnail_path = NULL, thumbnail_updated_at = NULL WHERE id = $1",
    )
    .bind(doc_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to clear thumbnail fields: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    Ok(Json(serde_json::json!({
        "message": "Thumbnail deleted successfully"
    })))
}

/// Download raw encrypted document bytes
pub async fn download_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<axum::body::Body, AppError> {
    // Verify ownership and get storage path
    let row = sqlx::query(
        r#"
        SELECT storage_path FROM documents
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error during download: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let row = match row {
        Some(r) => r,
        None => return Err(AppError::NotFound("Document not found".to_string())),
    };

    let storage_path: String = row.get("storage_path");

    let file = tokio::fs::File::open(&storage_path).await.map_err(|e| {
        tracing::error!("File not found on disk: {} ({})", storage_path, e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_DOWNLOAD,
        Some(audit::RESOURCE_DOCUMENT),
        Some(doc_id),
        None,
        None,
    ).await;

    let stream = tokio_util::io::ReaderStream::new(file);
    let body = axum::body::Body::from_stream(stream);

    Ok(body)
}

/// Soft-delete a document (move to trash)
pub async fn delete_document(
    session: AuthSession,
    Path(doc_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        r#"
        UPDATE documents
        SET deleted_at = NOW(),
            trash_origin_folder_id = folder_id
        WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(doc_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error soft-deleting document: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Document not found".to_string()));
    }

    audit::log_event(
        &state.db,
        session.user_id,
        audit::EVENT_DELETED,
        Some(audit::RESOURCE_DOCUMENT),
        Some(doc_id),
        None,
        None,
    ).await;

    Ok(Json(serde_json::json!({
        "message": "Document moved to trash"
    })))
}

/// Soft-delete all documents in a specific folder (move to trash)
pub async fn delete_folder_documents(
    session: AuthSession,
    Path(folder_id): Path<Uuid>,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query(
        r#"
        UPDATE documents
        SET deleted_at = NOW(),
            trash_origin_folder_id = folder_id
        WHERE folder_id = $1 AND owner_id = $2 AND deleted_at IS NULL
        "#,
    )
    .bind(folder_id)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("DB error soft-deleting folder documents: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let count = result.rows_affected();
    Ok(Json(serde_json::json!({
        "message": format!("{} document(s) moved to trash", count)
    })))
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/documents/upload-folder — Batch folder upload
// ─────────────────────────────────────────────────────────────────────────────
//
// Multipart structure:
//   - metadata: JSON array of { relative_path: "dir/file.pdf", encrypted_dek: "..." }
//   - file_0, file_1, ...: binary files in the same order as the metadata array
//
// The server:
//   1. Parses relative_path into directory components and filename
//   2. Ensures the folder hierarchy exists (creates missing folders)
//   3. Handles filename duplicates by appending " (n)"
//   4. Writes each file to disk and inserts metadata within a transaction

/// Ensure a folder path exists for the user, creating missing folders.
/// Returns the leaf folder_id (None if dir_path is empty for root-level files).
async fn ensure_folder_path(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    dir_path: &str,
    created: &mut Vec<FolderCreatedInfo>,
) -> Result<Option<Uuid>, AppError> {
    if dir_path.is_empty() {
        return Ok(None);
    }

    let components: Vec<&str> = dir_path.split('/').filter(|c| !c.is_empty()).collect();
    let mut current_parent: Option<Uuid> = None;
    let mut current_path = String::new();

    for component in components {
        if component == ".." {
            return Err(AppError::BadRequest("Path traversal detected in relative_path".to_string()));
        }
        if component.len() > 255 {
            return Err(AppError::BadRequest("Path component exceeds 255 characters".to_string()));
        }

        if !current_path.is_empty() {
            current_path.push('/');
        }
        current_path.push_str(component);

        // Idempotent find-or-create: try insert, handle unique violation
        let folder_id = loop {
            let existing = sqlx::query_scalar::<_, Uuid>(
                r#"
                SELECT id FROM folders
                WHERE owner_id = $1
                  AND parent_id IS NOT DISTINCT FROM $2
                  AND name = $3
                "#,
            )
            .bind(user_id)
            .bind(current_parent)
            .bind(component)
            .fetch_optional(&mut **tx)
            .await?;

            if let Some(id) = existing {
                break id;
            }

            let insert = sqlx::query_scalar::<_, Uuid>(
                r#"
                INSERT INTO folders (owner_id, parent_id, name)
                VALUES ($1, $2, $3)
                RETURNING id
                "#,
            )
            .bind(user_id)
            .bind(current_parent)
            .bind(component)
            .fetch_optional(&mut **tx)
            .await;

            match insert {
                Ok(Some(id)) => {
                    created.push(FolderCreatedInfo {
                        id,
                        name: component.to_string(),
                        parent_id: current_parent,
                        path: current_path.clone(),
                    });
                    break id;
                }
                Ok(None) => {
                    return Err(AppError::Internal(anyhow::anyhow!("Folder insert returned no row")));
                }
                Err(sqlx::Error::Database(ref db_err)) if db_err.is_unique_violation() => {
                    continue;
                }
                Err(e) => {
                    return Err(AppError::Internal(anyhow::anyhow!("DB error creating folder: {}", e)));
                }
            }
        };

        current_parent = Some(folder_id);
    }

    Ok(current_parent)
}

/// Resolve a filename, appending " (n)" if the name already exists in the target folder.
async fn resolve_filename(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    folder_id: Option<Uuid>,
    desired: &str,
) -> Result<String, AppError> {
    let exists = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*) FROM documents
        WHERE owner_id = $1
          AND folder_id IS NOT DISTINCT FROM $2
          AND name = $3
        "#,
    )
    .bind(user_id)
    .bind(folder_id)
    .bind(desired)
    .fetch_one(&mut **tx)
    .await?;

    if exists == 0 {
        return Ok(desired.to_string());
    }

    // Split stem and extension
    let (stem, ext) = match desired.rfind('.') {
        Some(pos) => (desired[..pos].to_string(), desired[pos..].to_string()),
        None => (desired.to_string(), String::new()),
    };

    for n in 1..=999 {
        let candidate = if ext.is_empty() {
            format!("{} ({})", stem, n)
        } else {
            format!("{} ({}){}", stem, n, ext)
        };

        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*) FROM documents
            WHERE owner_id = $1
              AND folder_id IS NOT DISTINCT FROM $2
              AND name = $3
            "#,
        )
        .bind(user_id)
        .bind(folder_id)
        .bind(&candidate)
        .fetch_one(&mut **tx)
        .await?;

        if count == 0 {
            return Ok(candidate);
        }
    }

    Err(AppError::BadRequest(format!(
        "Too many duplicate filenames for '{}'",
        desired
    )))
}

/// Upload a folder preserving directory hierarchy.
/// Accepts a multipart request with a JSON metadata array and matching file fields.
pub async fn upload_folder(
    session: AuthSession,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<FolderUploadResponse>, AppError> {
    // ── Phase 1: Parse the multipart request ──────────────────────────────
    let mut metadata_json: Option<String> = None;
    let mut file_map: BTreeMap<usize, Vec<u8>> = BTreeMap::new();

    while let Some(field) = multipart.next_field().await? {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "metadata" {
            metadata_json = Some(field.text().await.map_err(|_| {
                AppError::BadRequest("Failed to read metadata field".to_string())
            })?);
        } else if field_name.starts_with("file_") {
            let index: usize = field_name[5..].parse().map_err(|_| {
                AppError::BadRequest(format!("Invalid file field name: {}", field_name))
            })?;
            let data = field.bytes().await.map_err(|_| {
                AppError::BadRequest(format!("Failed to read file field {}", field_name))
            })?.to_vec();
            file_map.insert(index, data);
        }
    }

    // ── Phase 2: Validate ─────────────────────────────────────────────────
    let metadata: Vec<FolderUploadEntry> = match metadata_json {
        Some(json) => serde_json::from_str(&json).map_err(|e| {
            AppError::BadRequest(format!("Invalid metadata JSON: {}", e))
        })?,
        None => return Err(AppError::BadRequest("Missing metadata field".to_string())),
    };

    if metadata.is_empty() {
        return Err(AppError::BadRequest("No files in upload".to_string()));
    }

    if metadata.len() > 100 {
        return Err(AppError::BadRequest("Maximum 100 files per folder upload".to_string()));
    }

    if file_map.len() != metadata.len() {
        return Err(AppError::BadRequest(format!(
            "Mismatch: {} metadata entries but {} files received",
            metadata.len(),
            file_map.len()
        )));
    }

    // Verify all indices are contiguous from 0
    for i in 0..metadata.len() {
        if !file_map.contains_key(&i) {
            return Err(AppError::BadRequest(format!("Missing file_{}", i)));
        }
    }

    // ── Phase 3: Process within a transaction ──────────────────────────────
    let mut tx = state.db.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        AppError::Internal(anyhow::anyhow!("Internal error"))
    })?;

    let mut file_results: Vec<FolderUploadFileResult> = Vec::with_capacity(metadata.len());
    let mut created_folders: Vec<FolderCreatedInfo> = Vec::new();

    for (i, entry) in metadata.into_iter().enumerate() {
        // Validate relative path
        if entry.relative_path.is_empty() {
            return Err(AppError::BadRequest("Empty relative_path in entry".to_string()));
        }
        if entry.relative_path.starts_with('/') {
            return Err(AppError::BadRequest("relative_path must be relative, not absolute".to_string()));
        }
        if entry.relative_path.len() > 1024 {
            return Err(AppError::BadRequest("relative_path too long (max 1024 chars)".to_string()));
        }
        if entry.encrypted_dek.is_empty() {
            return Err(AppError::BadRequest("Missing encrypted_dek in entry".to_string()));
        }

        // Split path into directory and filename
        let (dir_path, filename) = match entry.relative_path.rfind('/') {
            Some(pos) => (entry.relative_path[..pos].to_string(), entry.relative_path[pos + 1..].to_string()),
            None => (String::new(), entry.relative_path.clone()),
        };

        if filename.is_empty() {
            return Err(AppError::BadRequest("Empty filename in relative_path".to_string()));
        }
        if filename.len() > 255 {
            return Err(AppError::BadRequest("Filename exceeds 255 characters".to_string()));
        }

        // Ensure the folder path exists
        let folder_id = ensure_folder_path(&mut tx, session.user_id, &dir_path, &mut created_folders).await?;

        // Resolve duplicate filename
        let unique_name = resolve_filename(&mut tx, session.user_id, folder_id, &filename).await?;

        // Generate storage ID and write file
        let doc_id = Uuid::new_v4();
        let storage_path = format!("uploads/{}", doc_id);
        let file_bytes = file_map.remove(&i).unwrap();

        tokio::fs::write(&storage_path, &file_bytes).await.map_err(|e| {
            tracing::error!("Failed to write file {}: {}", storage_path, e);
            AppError::Internal(anyhow::anyhow!("Internal error"))
        })?;

        let size = file_bytes.len() as i64;

        // Validate MIME type
        validate_mime_type(&entry.mime_type)?;

        // Insert document record
        sqlx::query(
            r#"
            INSERT INTO documents (id, owner_id, name, encrypted_dek, storage_path, size, mime_type, folder_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
        )
        .bind(doc_id)
        .bind(session.user_id)
        .bind(&unique_name)
        .bind(&entry.encrypted_dek)
        .bind(&storage_path)
        .bind(size)
        .bind(&entry.mime_type)
        .bind(folder_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("Failed to insert document: {}", e);
            AppError::Internal(anyhow::anyhow!("Internal error"))
        })?;

        file_results.push(FolderUploadFileResult {
            id: doc_id,
            name: unique_name,
            folder_id,
            relative_path: entry.relative_path,
            size,
        });
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Failed to commit folder upload transaction: {}", e);
        // Best-effort cleanup: remove written files
        for result in &file_results {
            let path = format!("uploads/{}", result.id);
            let _ = tokio::fs::remove_file(&path).await;
        }
        return Err(AppError::Internal(anyhow::anyhow!("Internal error")));
    }

    tracing::info!(
        "Folder upload complete: {} files, {} folders created by user {}",
        file_results.len(),
        created_folders.len(),
        session.user_id
    );

    let uploaded_count = file_results.len();
    Ok(Json(FolderUploadResponse {
        files: file_results,
        created_folders,
        message: format!("Uploaded {} files successfully", uploaded_count),
    }))
}
