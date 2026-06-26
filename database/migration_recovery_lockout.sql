-- ============================================================
-- Security hardening: per-user recovery phrase lockout
-- Run in Supabase SQL Editor (safe, additive)
-- ============================================================

-- When set, all /api/recovery/recover attempts for this user
-- are rejected with HTTP 429 until the timestamp passes.
-- Set to NOW() + 24h after N consecutive failed recovery attempts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_lockout_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_failed_attempts INT NOT NULL DEFAULT 0;

-- Helpful for monitoring / support tooling
CREATE INDEX IF NOT EXISTS idx_users_recovery_lockout ON users (recovery_lockout_until)
    WHERE recovery_lockout_until IS NOT NULL;