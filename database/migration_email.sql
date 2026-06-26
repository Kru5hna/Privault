-- Email verification support
-- Backfill existing rows before enforcing NOT NULL (adjust placeholder as needed)
-- UPDATE users SET email = 'placeholder+' || id::TEXT || '@example.com' WHERE email IS NULL;

ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL UNIQUE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Nullable: only set when a verification email is actively in-flight
ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN email_verification_sent_at TIMESTAMPTZ;

-- Index for fast email lookups (login, uniqueness checks)
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Index to quickly find unverified users (useful for cleanup jobs)
CREATE INDEX idx_users_email_verified ON users(email_verified) WHERE email_verified = false;
