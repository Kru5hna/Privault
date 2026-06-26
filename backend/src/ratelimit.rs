use axum::{
    http::Request,
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use std::{
    collections::HashMap,
    env,
    sync::LazyLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

/// Per-route rate limit configuration. All values read from env at startup,
/// with sensible defaults so the server runs even without a `.env` override.
#[derive(Clone, Copy, Debug)]
struct RateLimitConfig {
    max_requests: usize,
    window_secs: u64,
}

impl RateLimitConfig {
    /// Read `VAR_NAME` as `usize`, fall back to `default` if unset or unparseable.
    fn from_env(var: &str, default: usize) -> usize {
        env::var(var)
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }

    /// Read `VAR_NAME` as `u64`, fall back to `default` if unset or unparseable.
    fn from_env_u64(var: &str, default: u64) -> u64 {
        env::var(var)
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }

    fn load(max_var: &str, window_var: &str, default_max: usize, default_window: u64) -> Self {
        Self {
            max_requests: Self::from_env(max_var, default_max),
            window_secs: Self::from_env_u64(window_var, default_window),
        }
    }
}

struct RateLimiter {
    state: Mutex<HashMap<String, Vec<Instant>>>,
    config: RateLimitConfig,
}

impl RateLimiter {
    fn new(config: RateLimitConfig) -> Self {
        Self {
            state: Mutex::new(HashMap::new()),
            config,
        }
    }

    async fn check(&self, key: &str) -> bool {
        let mut state = self.state.lock().await;
        let now = Instant::now();
        let window = Duration::from_secs(self.config.window_secs);
        let timestamps = state.entry(key.to_string()).or_default();
        timestamps.retain(|t| now.duration_since(*t) < window);
        if timestamps.len() >= self.config.max_requests {
            return false;
        }
        timestamps.push(now);
        true
    }
}

static UPLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| {
    let cfg = RateLimitConfig::load(
        "RATELIMIT_UPLOAD_MAX",
        "RATELIMIT_UPLOAD_WINDOW_SECS",
        10,
        60,
    );
    RateLimiter::new(cfg)
});

static FOLDER_UPLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| {
    let cfg = RateLimitConfig::load(
        "RATELIMIT_FOLDER_UPLOAD_MAX",
        "RATELIMIT_FOLDER_UPLOAD_WINDOW_SECS",
        5,
        60,
    );
    RateLimiter::new(cfg)
});

static DOWNLOAD_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| {
    let cfg = RateLimitConfig::load(
        "RATELIMIT_DOWNLOAD_MAX",
        "RATELIMIT_DOWNLOAD_WINDOW_SECS",
        60,
        60,
    );
    RateLimiter::new(cfg)
});

static LOGIN_LIMITER: LazyLock<RateLimiter> = LazyLock::new(|| {
    let cfg = RateLimitConfig::load(
        "RATELIMIT_LOGIN_MAX",
        "RATELIMIT_LOGIN_WINDOW_SECS",
        5,
        60,
    );
    RateLimiter::new(cfg)
});

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