mod handlers;
mod models;

use axum::{
    routing::{delete, get, post},
    Router,
};

pub use handlers::cleanup_expired_trash;

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/", get(handlers::list_trash))
        .route("/empty", delete(handlers::empty_trash))
        .route("/restore/:item_type/:item_id", post(handlers::restore_item))
        .route("/:item_type/:item_id", delete(handlers::permanent_delete_item))
}
