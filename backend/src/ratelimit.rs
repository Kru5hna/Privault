use axum::{
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use std::{
    collections::HashMap,
    sync::LazyLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

struct RateLimiter {
    state: Mutex<HashMap<String, Vec<Instant>>>,
    max_requests: usize,
    window: Duration,
}

impl RateLimiter {
    fn new(max_requests: usize, window_secs: u64) -> Self {
        Self {
            state: Mutex::new(HashMap::new()),
            max_requests,
            window: Duration::from_secs(window_secs),
        }
    }

    async fn check(&self, key: &str) -> bool {
        let mut state = self.state.lock().await;
        let now = Instant::now();
        let timestamps = state.entry(key.to_string()).or_default();
        timestamps.retain(|t| now.duration_since(*t) < self.window);
        if timestamps.len() >= self.max_requests {
            return false;
        }
        timestamps.push(now);
        true
    }
}

static UPLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| RateLimiter::new(10, 60));
static FOLDER_UPLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| RateLimiter::new(5, 60));
static DOWNLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| RateLimiter::new(60, 60));
static LOGIN_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| RateLimiter::new(5, 60));

fn extract_auth_key(request: &Request<axum::body::Body>) -> String {
    request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("anonymous")
        .to_string()
}

fn extract_ip_key(request: &Request<axum::body::Body>) -> String {
    request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn rate_limited() -> Response {
    (
        axum::http::StatusCode::TOO_MANY_REQUESTS,
        Json(serde_json::json!({"error": "Rate limit exceeded. Try again later."})),
    )
        .into_response()
}

pub async fn rate_limit_upload(
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if UPLOAD_LIMITER.check(&extract_auth_key(&request)).await {
        next.run(request).await
    } else {
        rate_limited()
    }
}

pub async fn rate_limit_folder_upload(
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if FOLDER_UPLOAD_LIMITER.check(&extract_auth_key(&request)).await {
        next.run(request).await
    } else {
        rate_limited()
    }
}

pub async fn rate_limit_download(
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if DOWNLOAD_LIMITER.check(&extract_auth_key(&request)).await {
        next.run(request).await
    } else {
        rate_limited()
    }
}

pub async fn rate_limit_login(
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    if LOGIN_LIMITER.check(&extract_ip_key(&request)).await {
        next.run(request).await
    } else {
        rate_limited()
    }
}
