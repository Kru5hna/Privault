mod handlers;
mod models;

use axum::{
    routing::{delete, get, post},
    Router,
};

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/", post(handlers::create_share_link))
        .route("/mine", get(handlers::list_my_share_links))
        .route("/:id", get(handlers::get_share_link))
        .route("/:id", delete(handlers::revoke_share_link))
        .route("/:id/download", get(handlers::download_shared_document))
}
