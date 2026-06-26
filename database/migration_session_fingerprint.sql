-- ============================================================
-- Security hardening: session fingerprint binding
-- Run in Supabase SQL Editor (safe, additive)
-- ============================================================

-- Stored at login time. The auth middleware checks that the
-- incoming request's IP prefix and User-Agent prefix match —
-- a stolen token used from a different device/network will be
-- rejected with 401.
--
-- Why prefixes instead of full values?
--   - IP: user on mobile data may hop cells; matching the first
--         3 octets (IPv4) or first 4 hextets (IPv6) tolerates that
--         while still rejecting an attacker on a different network.
--   - UA: truncated to first 64 chars; tolerates version bumps
--         but still binds to the same browser family.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_prefix VARCHAR(45);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ua_prefix VARCHAR(64);

-- Backfill any existing sessions with empty prefixes so they
-- won't trip the new check (they'll be re-validated on next use
-- via the IP/UA captured at login going forward).
UPDATE sessions SET ip_prefix = '', ua_prefix = '' WHERE ip_prefix IS NULL;