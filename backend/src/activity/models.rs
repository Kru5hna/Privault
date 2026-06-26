use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct LogActivityRequest {
    pub action: String,
    pub details: String,
}

#[derive(Debug, Serialize)]
pub struct ActivityLogEntry {
    pub id: Uuid,
    pub action: String,
    pub details: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ActivityLogListResponse {
    pub logs: Vec<ActivityLogEntry>,
    pub total: usize,
}
