use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct TagMetadata {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub color: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

impl<'r> sqlx::FromRow<'r, sqlx::postgres::PgRow> for TagMetadata {
    fn from_row(row: &'r sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            id: row.try_get("id")?,
            owner_id: row.try_get("owner_id")?,
            name: row.try_get("name")?,
            color: row.try_get("color")?,
            created_at: row.try_get("created_at")?,
        })
    }
}
