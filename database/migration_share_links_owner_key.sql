-- ============================================================
-- Phase 2, Step 2: Share Link Recovery Column Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Add owner_encrypted_link_key to share_links table
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS owner_encrypted_link_key TEXT;
