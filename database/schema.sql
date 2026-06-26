-- Enable the uuid-ossp extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
-- Stores user credentials and per-user crypto metadata.
-- The server NEVER sees the plaintext password or private key.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,

    -- Required contact & verification fields
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,

    -- Nullable: only populated during an active verification flow
    email_verification_token VARCHAR(255),
    email_verification_sent_at TIMESTAMPTZ,

    -- Server-side Argon2id hash of the client-derived auth verifier.
    -- The client derives an auth_verifier from (password + auth_salt),
    -- and the server hashes it again with Argon2id before storing.
    -- This means a DB leak does NOT give an attacker a usable credential.
    auth_hash TEXT NOT NULL,

    -- Random salts (base64-encoded, generated on registration).
    -- Separate salts ensure auth derivation and key-wrapping derivation
    -- are cryptographically independent.
    auth_salt TEXT NOT NULL,
    kek_salt TEXT NOT NULL,

    -- RSA public key in SPKI base64 format (used by others to encrypt DEKs for this user)
    public_key TEXT NOT NULL,

    -- RSA private key wrapped (encrypted) with the user's KEK (AES-GCM)
    wrapped_private_key TEXT NOT NULL,

    -- The AES-GCM initialization vector used when wrapping the private key
    wrapped_private_key_iv TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    encrypted_dek TEXT NOT NULL,
    storage_path VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sessions Table
-- Stores hashed session tokens for server-side session management.
-- The raw token is held by the client; only its SHA-256 hash lives in the DB.
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for faster querying
CREATE INDEX idx_users_username ON users(username);
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_verified ON users(email_verified) WHERE email_verified = false;
CREATE INDEX idx_documents_owner_id ON documents(owner_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
