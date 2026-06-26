-- ============================================================
-- Security hardening: sliding session expiry
-- Run in Supabase SQL Editor (safe, additive)
-- ============================================================

-- Tracks the last time this session was used. The auth middleware
-- will bump this on every authenticated request, and bump
-- expires_at by the same amount if more than 1h has passed.
-- Combined with the hard cap on created_at + 7d, sessions are
-- effectively idle-timeout: long-idle sessions expire in 24h,
-- but actively-used sessions refresh themselves up to 7d total.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions (last_used_at);