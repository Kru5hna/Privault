# Privault

**Zero-knowledge encrypted document vault.** Files never leave your machine unencrypted.

---

## How it works

All cryptography happens in the browser using the Web Crypto API. The server never sees plaintext passwords, private keys, or file contents.

- **AES-256-GCM** encrypts every file with a unique data key
- **RSA-2048** wraps that key with your public key — only your private key can unwrap it
- **PBKDF2** derives your key encryption key from your password (never sent to the server)
- **Web Workers** keep crypto off the main thread so the UI stays responsive

## Features

- End-to-end encrypted upload, download, and preview
- Folder hierarchy with batch upload
- Cryptographically secure share links (view-only or downloadable)
- BIP39 recovery phrase — recover your account without a password
- Soft-delete trash with automatic cleanup
- Tagging and activity audit log
- Zero-knowledge auth — server stores only Argon2id-hashed verifiers

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TanStack Query |
| Backend | Rust, Axum, SQLx, PostgreSQL |
| Crypto | Web Crypto API (AES-GCM, RSA-OAEP, PBKDF2) |
| Deployment | Vercel (frontend), Railway / Render (backend) |

## Getting started

```bash
# Backend
cp .env backend/.env          # configure DATABASE_URL
cargo run --package privault-backend

# Frontend
cd frontend
cp .env.local.example .env.local
npm install && npm run dev
```

Run all database migrations in `database/` against your PostgreSQL instance before starting the backend.

## License

MIT
