-- ============================================================
-- Phase 1, Step 1: Folder System Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

-- 1. Create the folders table
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add indexes for folder queries
CREATE INDEX idx_folders_owner ON folders(owner_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

-- 3. Add folder_id column to documents table
ALTER TABLE documents ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX idx_documents_folder ON documents(folder_id);
