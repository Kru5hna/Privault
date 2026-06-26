mod handlers;
mod models;

use axum::routing::{delete, get, post};
use axum::Router;

pub fn router() -> Router<crate::AppState> {
    Router::new()
        .route("/", post(handlers::log_activity).get(handlers::get_activity).delete(handlers::clear_activity))
}
