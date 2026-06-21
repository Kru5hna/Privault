-- ============================================================
-- Feature 3: Thumbnail Storage — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Add thumbnail storage columns to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail_updated_at TIMESTAMPTZ;

-- Document updated_at should trigger on row changes
-- Ensure the trigger exists for updated_at
CREATE OR REPLACE FUNCTION update_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_document_timestamp();
