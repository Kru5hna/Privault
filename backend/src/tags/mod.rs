mod handlers;
mod models;



use axum::{
    routing::{delete, get, post},
    Router,
};

pub fn router() -> Router<crate::AppState> {
    Router::new()
        // Tag management
        .route("/", post(handlers::create_tag))
        .route("/", get(handlers::list_tags))
        .route("/:id", delete(handlers::delete_tag))
        // Document-tag associations
        .route("/document/:id", post(handlers::tag_document))
        .route("/document/:id", get(handlers::list_document_tags))
        .route("/document/:doc_id/:tag_id", delete(handlers::untag_document))
}
