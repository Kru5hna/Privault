mod handlers;
mod models;

use axum::{
    routing::{delete, get, post},
    Router,
};

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/", get(handlers::list_documents))
        .route("/", post(handlers::upload_document))
        .route("/:id", get(handlers::download_document))
        .route("/:id", delete(handlers::delete_document))
        .route("/folder/:folder_id", delete(handlers::delete_folder_documents))
}
