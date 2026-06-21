-- ============================================================
-- Feature 7: Recovery Phrase — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Add recovery columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_auth_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_phrase_hash TEXT;

-- Index for recovery operations (rare, but useful for lookup)
CREATE INDEX IF NOT EXISTS idx_users_recovery_phrase ON users (recovery_phrase_hash)
    WHERE recovery_phrase_hash IS NOT NULL;

-- Store the private key wrapped with the recovery KEK (AES-GCM)
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_wrapped_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_wrapped_key_iv TEXT;
