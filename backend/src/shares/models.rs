use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareLink {
    pub id: Uuid,
    pub document_id: Uuid,
    pub owner_id: Uuid,
    pub encrypted_dek: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub download_limit: Option<i32>,
    pub downloads_count: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub owner_encrypted_link_key: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ShareLinkResponse {
    pub id: Uuid,
    pub document_id: Uuid,
    pub document_name: String,
    pub document_size: i64,
    pub encrypted_dek: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub download_limit: Option<i32>,
    pub downloads_count: i32,
    pub created_at: Option<DateTime<Utc>>,
    pub owner_encrypted_link_key: Option<String>,
}
