use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::tags::models::TagMetadata;

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: Uuid,
    pub name: String,
    pub encrypted_dek: String,
    pub size: i64,
    pub mime_type: String,
    pub folder_id: Option<Uuid>,
    pub created_at: Option<DateTime<Utc>>,
    pub has_thumbnail: bool,
}

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for DocumentMetadata {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            encrypted_dek: row.try_get("encrypted_dek")?,
            size: row.try_get("size")?,
            mime_type: row.try_get("mime_type")?,
            folder_id: row.try_get("folder_id")?,
            created_at: row.try_get("created_at")?,
            has_thumbnail: row.try_get("has_thumbnail")?,
        })
    }
}

/// Detailed document info for the preview screen.
#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentDetail {
    pub id: Uuid,
    pub name: String,
    pub encrypted_dek: String,
    pub size: i64,
    pub mime_type: String,
    pub folder_id: Option<Uuid>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
    pub has_thumbnail: bool,
    pub tags: Vec<TagMetadata>,
    pub share_count: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder Upload — Batch upload preserving directory hierarchy
// ─────────────────────────────────────────────────────────────────────────────

/// One entry in the folder upload manifest.
/// `relative_path` is the path from the uploaded folder root, e.g. "docs/work/report.pdf".
#[derive(Debug, Deserialize)]
pub struct FolderUploadEntry {
    pub relative_path: String,
    pub encrypted_dek: String,
    #[serde(default = "default_mime")]
    pub mime_type: String,
}

fn default_mime() -> String {
    "application/octet-stream".to_string()
}

/// Result for one successfully uploaded file.
#[derive(Debug, Serialize)]
pub struct FolderUploadFileResult {
    pub id: Uuid,
    pub name: String,
    pub folder_id: Option<Uuid>,
    pub relative_path: String,
    pub size: i64,
}

/// Describes a folder that was created during the upload.
#[derive(Debug, Serialize)]
pub struct FolderCreatedInfo {
    pub id: Uuid,
    pub name: String,
    pub parent_id: Option<Uuid>,
    pub path: String,
}

/// Final response for the folder upload endpoint.
#[derive(Debug, Serialize)]
pub struct FolderUploadResponse {
    pub files: Vec<FolderUploadFileResult>,
    pub created_folders: Vec<FolderCreatedInfo>,
    pub message: String,
}
