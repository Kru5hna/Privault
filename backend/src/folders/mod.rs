mod handlers;
mod models;



use axum::{
    routing::{delete, get, patch, post},
    Router,
};

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/", post(handlers::create_folder))
        .route("/", get(handlers::list_folders))
        .route("/all", get(handlers::list_all_folders))
        .route("/:id", delete(handlers::delete_folder))
        .route("/:id", patch(handlers::rename_folder))
        .route("/:id/stats", get(handlers::get_folder_stats))
}
