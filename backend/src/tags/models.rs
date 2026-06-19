use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct TagMetadata {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub color: String,
    pub created_at: Option<DateTime<Utc>>,
}
