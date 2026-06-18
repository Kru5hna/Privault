use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

/// Unified error type for all API responses.
///
/// Each variant maps to a specific HTTP status code and produces
/// a consistent JSON body: `{ "error": "<message>" }`.
///
/// Internal details (DB queries, stack traces) are logged server-side
/// but never leaked to the client.
pub enum AppError {
    BadRequest(String),       // 400 — validation failures, malformed input
    Unauthorized(String),     // 401 — missing/invalid/expired session
    NotFound(String),         // 404 — resource doesn't exist
    Conflict(String),         // 409 — duplicate resource (e.g. username taken)
    Internal(anyhow::Error),  // 500 — unexpected server errors
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            AppError::Internal(err) => {
                tracing::error!("Internal server error: {:?}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
        };

        let body = Json(json!({ "error": message }));
        (status, body).into_response()
    }
}

/// Blanket conversion: any error type that implements `Into<anyhow::Error>`
/// (which includes sqlx::Error, std::io::Error, etc.) automatically becomes
/// an AppError::Internal. This keeps handler code clean — just use `?`.
impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self::Internal(err.into())
    }
}
