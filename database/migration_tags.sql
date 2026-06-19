-- ============================================================
-- Phase 1, Step 4: Tagging System Migration
-- Run this in the Supabase SQL Editor
-- ============================================================

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#E41613',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_id, name)
);

CREATE TABLE document_tags (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX idx_tags_owner ON tags(owner_id);
CREATE INDEX idx_document_tags_doc ON document_tags(document_id);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);
