use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub id: Uuid,
    pub name: String,
    pub encrypted_dek: String,
    pub size: i64,
    pub created_at: Option<DateTime<Utc>>,
}
