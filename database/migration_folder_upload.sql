-- ============================================================
-- Feature 1: Folder Upload Support — Schema additions
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Add unique constraint on folder (owner_id, parent_id, name)
-- Prevents duplicate folder names under the same parent
-- Required for idempotent folder path creation during batch upload
DELETE FROM folders f1
USING folders f2
WHERE f1.id > f2.id
  AND f1.owner_id = f2.owner_id
  AND f1.name = f2.name
  AND (f1.parent_id IS NOT NULL AND f2.parent_id IS NOT NULL AND f1.parent_id = f2.parent_id)
  AND (f1.parent_id IS NULL AND f2.parent_id IS NULL);

ALTER TABLE folders ADD CONSTRAINT uq_folder_parent_name UNIQUE (owner_id, parent_id, name);

-- 2. Add unique constraint on document (owner_id, folder_id, name)
-- Prevents duplicate filenames in the same folder
-- NULL folder_id means root level — we exclude that from the constraint
DELETE FROM documents d1
USING documents d2
WHERE d1.id > d2.id
  AND d1.owner_id = d2.owner_id
  AND d1.name = d2.name
  AND (d1.folder_id IS NOT NULL AND d2.folder_id IS NOT NULL AND d1.folder_id = d2.folder_id)
  AND (d1.folder_id IS NULL AND d2.folder_id IS NULL);

CREATE UNIQUE INDEX uq_document_folder_name 
ON documents (owner_id, COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'), name);
