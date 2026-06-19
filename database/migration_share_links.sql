-- ============================================================
-- Phase 2, Step 1: Share Links System Migration
-- ============================================================

-- Create the share_links table
CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_dek TEXT NOT NULL,       -- DEK re-encrypted with a random Link Key
    expires_at TIMESTAMPTZ,            -- NULL = never expires
    download_limit INTEGER,            -- NULL = unlimited
    downloads_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for share link queries
CREATE INDEX IF NOT EXISTS idx_share_links_document ON share_links(document_id);
CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(owner_id);
