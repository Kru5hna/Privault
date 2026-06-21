-- ============================================================
-- Feature 2: Smart Preview Support — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add mime_type column to documents
-- Client-provided since files are encrypted at rest
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream';

-- 2. Index for MIME-based queries (e.g. count by type)
CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON documents (owner_id, mime_type);
