-- ============================================================
-- Feature 5: Secure Trash — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add soft-delete columns to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS trash_origin_folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- 2. Add soft-delete columns to folders
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS trash_origin_parent_id UUID REFERENCES folders(id) ON DELETE SET NULL;

-- 3. Indexes for trash queries
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents (owner_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_folders_deleted ON folders (owner_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- 4. Modify existing queries to exclude soft-deleted items:
--    All SELECT queries on active documents/folders should add "AND deleted_at IS NULL"
--    (Handled in application code, not SQL)
