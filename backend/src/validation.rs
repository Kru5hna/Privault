//! Input validation helpers used across handlers.
//!
//! Each validator returns `Result<(), AppError>` so handlers can
//! simply `?` it. Keep error messages generic — never reveal
//! which specific rule failed (helps against username/enumeration
//! probing).

use crate::error::AppError;

/// Reserved usernames that collide with system paths, future admin
/// accounts, or commonly-reserved terms. Case-folded before compare.
const RESERVED_USERNAMES: &[&str] = &[
    "admin", "administrator", "api", "root", "system", "support",
    "privault", "null", "undefined", "anonymous", "me", "you",
    "login", "logout", "register", "signup", "settings", "help",
    "about", "terms", "privacy", "security",
];

/// Length bounds — chosen to match common practice and the DB
/// column size (`users.username VARCHAR(255)`).
pub const USERNAME_MIN: usize = 3;
pub const USERNAME_MAX: usize = 32;
pub const EMAIL_MAX: usize = 254; // RFC 5321 §4.5.3.1.3
pub const FILENAME_MIN: usize = 1;
pub const FILENAME_MAX: usize = 255;
pub const FOLDER_NAME_MAX: usize = 64;
pub const TAG_NAME_MAX: usize = 32;

/// Validate a username for registration or login.
///
/// Rules:
///   - trimmed length 3..=32
///   - characters `[a-zA-Z0-9_.-]` only
///   - not starting or ending with `.` or `-`
///   - no `..` substring
///   - not in reserved list (case-insensitive)
pub fn validate_username(raw: &str) -> Result<(), AppError> {
    let s = raw.trim();
    let len = s.chars().count();
    if len < USERNAME_MIN || len > USERNAME_MAX {
        return Err(AppError::BadRequest(
            format!("Username must be {} to {} characters", USERNAME_MIN, USERNAME_MAX),
        ));
    }
    if !s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-') {
        return Err(AppError::BadRequest(
            "Username may only contain letters, digits, '_', '.', '-'".to_string(),
        ));
    }
    if let Some(first) = s.chars().next() {
        if first == '.' || first == '-' {
            return Err(AppError::BadRequest(
                "Username cannot start with '.' or '-'".to_string(),
            ));
        }
    }
    if let Some(last) = s.chars().last() {
        if last == '.' || last == '-' {
            return Err(AppError::BadRequest(
                "Username cannot end with '.' or '-'".to_string(),
            ));
        }
    }
    if s.contains("..") {
        return Err(AppError::BadRequest(
            "Username cannot contain consecutive '.'".to_string(),
        ));
    }
    let lower = s.to_ascii_lowercase();
    if RESERVED_USERNAMES.iter().any(|r| *r == lower) {
        return Err(AppError::BadRequest(
            "Username is not available".to_string(),
        ));
    }
    Ok(())
}

/// Validate an email address. Returns the normalized
/// (trimmed + lowercased) form.
pub fn validate_email(raw: &str) -> Result<String, AppError> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(AppError::BadRequest("Email is required".to_string()));
    }
    if s.len() > EMAIL_MAX {
        return Err(AppError::BadRequest("Email address is too long".to_string()));
    }
    // RFC-5322-lite: local@domain.tld where TLD is 2+ letters.
    // Hand-rolled to avoid pulling in the `email_address` crate.
    let mut parts = s.splitn(2, '@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    if parts.next().is_some() {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    if local.is_empty() || domain.is_empty() {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    if local.contains("..") || local.starts_with('.') || local.ends_with('.') || local.starts_with('-') || local.ends_with('-') {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    let local_ok = local.chars().all(|c| {
        c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
    });
    if !local_ok {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    // Domain: must contain a '.', last label 2+ letters, each label
    // alphanumeric + hyphen, no leading/trailing hyphen.
    if !domain.contains('.') {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    for (i, label) in labels.iter().enumerate() {
        if label.is_empty() {
            return Err(AppError::BadRequest("Invalid email address".to_string()));
        }
        if i == labels.len() - 1 && label.len() < 2 {
            return Err(AppError::BadRequest("Invalid email address".to_string()));
        }
        if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(AppError::BadRequest("Invalid email address".to_string()));
        }
        if label.starts_with('-') || label.ends_with('-') {
            return Err(AppError::BadRequest("Invalid email address".to_string()));
        }
    }
    Ok(s.to_ascii_lowercase())
}

/// Validate a filename or document name.
///
/// Used for both top-level uploads and folder-internal filenames.
pub fn validate_filename(raw: &str) -> Result<(), AppError> {
    let s = raw.trim();
    let len = s.chars().count();
    if len < FILENAME_MIN || len > FILENAME_MAX {
        return Err(AppError::BadRequest(
            format!("Filename must be {} to {} characters", FILENAME_MIN, FILENAME_MAX),
        ));
    }
    // Reject path separators and NUL/control bytes — anything that
    // could break a downstream filesystem or S3 listing.
    for c in s.chars() {
        if c == '/' || c == '\\' || c == '\0' || (c as u32) < 0x20 {
            return Err(AppError::BadRequest(
                "Filename contains invalid characters".to_string(),
            ));
        }
    }
    if s == "." || s == ".." {
        return Err(AppError::BadRequest("Filename is not allowed".to_string()));
    }
    Ok(())
}

/// Validate a folder name. Same rules as filenames but with a
/// shorter max length (folders don't need long names).
pub fn validate_folder_name(raw: &str) -> Result<(), AppError> {
    let s = raw.trim();
    let len = s.chars().count();
    if s.is_empty() || len > FOLDER_NAME_MAX {
        return Err(AppError::BadRequest(
            format!("Folder name must be 1 to {} characters", FOLDER_NAME_MAX),
        ));
    }
    for c in s.chars() {
        if c == '/' || c == '\\' || c == '\0' || (c as u32) < 0x20 {
            return Err(AppError::BadRequest(
                "Folder name contains invalid characters".to_string(),
            ));
        }
    }
    if s == "." || s == ".." {
        return Err(AppError::BadRequest("Folder name is not allowed".to_string()));
    }
    Ok(())
}

/// Validate a tag name and color.
pub fn validate_tag_name(raw: &str) -> Result<(), AppError> {
    let s = raw.trim();
    let len = s.chars().count();
    if s.is_empty() || len > TAG_NAME_MAX {
        return Err(AppError::BadRequest(
            format!("Tag name must be 1 to {} characters", TAG_NAME_MAX),
        ));
    }
    // Tags are displayed inline in the UI — keep them short, no
    // control chars, no whitespace other than space.
    if s.chars().any(|c| c.is_control()) {
        return Err(AppError::BadRequest("Tag name contains invalid characters".to_string()));
    }
    Ok(())
}

/// Validate a hex color string (`#rrggbb`). Empty string is allowed
/// (means "use default"); any other value must match the format.
pub fn validate_color(raw: &str) -> Result<(), AppError> {
    if raw.is_empty() {
        return Ok(());
    }
    let s = raw.trim();
    if s.len() != 7 || !s.starts_with('#') {
        return Err(AppError::BadRequest("Color must be in #rrggbb format".to_string()));
    }
    if !s[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(AppError::BadRequest("Color must be in #rrggbb format".to_string()));
    }
    Ok(())
}

/// Validate a 12-word BIP39 recovery phrase (checksum + wordlist).
/// Delegates to the recovery module's existing `validate_phrase`.
pub fn validate_recovery_phrase(raw: &str) -> Result<(), AppError> {
    let s = raw.trim();
    super::recovery::validate_phrase(s)
        .map(|_| ())
        .map_err(|e| AppError::BadRequest(format!("Invalid recovery phrase: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn username_rejects_empty_and_short() {
        assert!(validate_username("").is_err());
        assert!(validate_username(" a ").is_err()); // trimmed too short
        assert!(validate_username("ab").is_err()); // 2 chars
    }

    #[test]
    fn username_rejects_too_long() {
        assert!(validate_username(&"a".repeat(33)).is_err());
    }

    #[test]
    fn username_rejects_bad_chars() {
        assert!(validate_username("hello world").is_err());
        assert!(validate_username("hi!").is_err());
        assert!(validate_username("héllo").is_err()); // non-ascii
    }

    #[test]
    fn username_rejects_leading_trailing_dots_and_dashes() {
        assert!(validate_username(".hello").is_err());
        assert!(validate_username("hello.").is_err());
        assert!(validate_username("-hello").is_err());
        assert!(validate_username("hello-").is_err());
    }

    #[test]
    fn username_rejects_double_dots() {
        assert!(validate_username("hello..world").is_err());
    }

    #[test]
    fn username_rejects_reserved() {
        assert!(validate_username("admin").is_err());
        assert!(validate_username("ADMIN").is_err());
        assert!(validate_username("Admin").is_err());
        assert!(validate_username("Privault").is_err());
    }

    #[test]
    fn username_accepts_valid() {
        assert!(validate_username("krish").is_ok());
        assert!(validate_username("k.ru5hna").is_ok());
        assert!(validate_username("user_123").is_ok());
        assert!(validate_username("a-b-c").is_ok());
    }

    #[test]
    fn email_normalizes_lowercase_and_validates() {
        assert_eq!(validate_email("  Foo@Bar.COM ").unwrap(), "foo@bar.com");
        assert!(validate_email("").is_err());
        assert!(validate_email("no-at-sign").is_err());
        assert!(validate_email("two@@signs.com").is_err());
        assert!(validate_email("trailing@dot@bad.com").is_err());
        assert!(validate_email("a@b").is_err()); // no TLD
        assert!(validate_email("a@b.c").is_err()); // TLD too short
        assert!(validate_email("local..double@bad.com").is_err());
        assert!(validate_email("-leading@dash.com").is_err());
        assert!(validate_email("trailing@dash-.com").is_err());
    }

    #[test]
    fn email_accepts_valid() {
        assert!(validate_email("user@example.com").is_ok());
        assert!(validate_email("a.b+c@sub.example.co").is_ok());
    }

    #[test]
    fn filename_rejects_path_separators_and_control() {
        assert!(validate_filename("a/b").is_err());
        assert!(validate_filename("a\\b").is_err());
        assert!(validate_filename("a\0b").is_err());
        assert!(validate_filename("a\nb").is_err());
        assert!(validate_filename(".").is_err());
        assert!(validate_filename("..").is_err());
    }

    #[test]
    fn filename_rejects_too_long() {
        assert!(validate_filename(&"a".repeat(256)).is_err());
    }

    #[test]
    fn filename_accepts_valid() {
        assert!(validate_filename("hello.txt").is_ok());
        assert!(validate_filename("report (1).pdf").is_ok());
        assert!(validate_filename("doc with spaces.md").is_ok());
    }

    #[test]
    fn color_validates_hex() {
        assert!(validate_color("").is_ok()); // empty is allowed
        assert!(validate_color("#E41613").is_ok());
        assert!(validate_color("#fff").is_err()); // wrong length
        assert!(validate_color("E41613").is_err()); // no #
        assert!(validate_color("#ZZZZZZ").is_err()); // non-hex
    }
}