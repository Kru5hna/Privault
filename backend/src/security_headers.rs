//! HTTP security headers applied to every backend response.
//!
//! These headers are the first line of defense against browser-side
//! attacks (XSS, clickjacking, MIME sniffing, information leakage).
//! They cost nothing and break whole classes of attacks.
//!
//! Apply this layer as the outermost middleware in `main.rs` so
//! the headers go on EVERY response, including CORS preflights,
//! error responses from `AppError`, and rate-limit 429s.

use axum::http::{header::HeaderName, HeaderValue};
use tower_http::set_header::SetResponseHeaderLayer;

/// Connect-src allowlist: the only hosts the browser may fetch from.
/// Update this if a new deployment target is added, or load from env.
const CSP_CONNECT_SRC: &str = "https://privault-kmnx.onrender.com https://privault-backend.up.railway.app";

/// Build a single `Content-Security-Policy` value.
///
/// Dev-friendly (allows inline styles required by Next.js HMR); in
/// production the frontend should override this via `next.config.ts`.
fn build_csp() -> String {
    format!(
        "default-src 'self'; \
         img-src 'self' data: blob:; \
         style-src 'self' 'unsafe-inline'; \
         script-src 'self'; \
         connect-src 'self' {connect}; \
         frame-ancestors 'none'; \
         base-uri 'self'; \
         form-action 'self'",
        connect = CSP_CONNECT_SRC,
    )
}

/// Returns a vector of `SetResponseHeaderLayer`s — one per header.
///
/// Each layer is `Clone` so the caller can apply them in sequence
/// with `.layer(...)` on the Router. Apply each in order; the order
/// doesn't affect runtime behavior.
pub fn layers() -> Vec<(
    axum::http::HeaderName,
    HeaderValue,
)> {
    let csp = HeaderValue::from_str(&build_csp())
        .expect("CSP string is statically valid");

    vec![
        (
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ),
        (
            HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        ),
        (
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ),
        (
            HeaderName::from_static("strict-transport-security"),
            HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        ),
        (
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
        ),
        (
            HeaderName::from_static("content-security-policy"),
            csp,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csp_includes_connect_src_hosts() {
        let csp = build_csp();
        assert!(csp.contains("privault-kmnx.onrender.com"));
        assert!(csp.contains("privault-backend.up.railway.app"));
    }

    #[test]
    fn csp_blocks_framing() {
        let csp = build_csp();
        assert!(csp.contains("frame-ancestors 'none'"));
    }

    #[test]
    fn csp_default_src_self() {
        let csp = build_csp();
        assert!(csp.contains("default-src 'self'"));
    }
}