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
        .route("/:id", get(handlers::get_document))
        .route("/:id", delete(handlers::delete_document))
        .route("/folder/:folder_id", delete(handlers::delete_folder_documents))
        .route("/upload-folder", post(handlers::upload_folder))
        .route("/:id/download", get(handlers::download_document))
        .route("/:id/thumbnail", get(handlers::download_thumbnail))
        .route("/:id/thumbnail", post(handlers::upload_thumbnail))
        .route("/:id/thumbnail", delete(handlers::delete_thumbnail))
}
