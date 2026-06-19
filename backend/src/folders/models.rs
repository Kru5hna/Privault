use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderMetadata {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub created_at: Option<DateTime<Utc>>,
}
