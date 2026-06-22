-- ============================================================
-- Fix: Unique constraint conflicts with soft-deleted documents
-- ============================================================
-- The unique index uq_document_folder_name prevents inserting
-- a new document when a trashed (soft-deleted) document with
-- the same name already exists. This fix excludes trashed rows
-- from the uniqueness check.

DROP INDEX IF EXISTS uq_document_folder_name;

CREATE UNIQUE INDEX uq_document_folder_name 
ON documents (owner_id, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'), name)
WHERE deleted_at IS NULL;
