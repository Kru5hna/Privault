-- ============================================================
-- Feature 4: Share Permissions — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Add permission column to share_links
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS permission VARCHAR(20) NOT NULL DEFAULT 'download_allowed';

-- Add check constraint for valid permission values
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS ck_share_permission;
ALTER TABLE share_links ADD CONSTRAINT ck_share_permission 
    CHECK (permission IN ('view_only', 'download_allowed'));

-- Index for permission-based queries
CREATE INDEX IF NOT EXISTS idx_share_links_permission ON share_links (permission);
