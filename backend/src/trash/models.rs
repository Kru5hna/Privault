use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

/// A trashed document with original location info for restore.
#[derive(Debug, Serialize)]
pub struct TrashedDocument {
    pub id: Uuid,
    pub name: String,
    pub size: i64,
    pub mime_type: String,
    pub original_folder_id: Option<Uuid>,
    pub deleted_at: DateTime<Utc>,
    pub days_left: i64,
}

/// A trashed folder with original location info for restore.
#[derive(Debug, Serialize)]
pub struct TrashedFolder {
    pub id: Uuid,
    pub name: String,
    pub original_parent_id: Option<Uuid>,
    pub deleted_at: DateTime<Utc>,
    pub days_left: i64,
    pub file_count: i64,
    pub subfolder_count: i64,
}

/// Combined trash listing response.
#[derive(Debug, Serialize)]
pub struct TrashListResponse {
    pub documents: Vec<TrashedDocument>,
    pub folders: Vec<TrashedFolder>,
    pub total_count: usize,
}
