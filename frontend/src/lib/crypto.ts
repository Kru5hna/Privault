/**
 * Client-side End-to-End Encryption (E2EE) engine for Privault.
 *
 * All encryption and key derivation happens here in the browser.
 * The server NEVER sees plaintext passwords, private keys, or file contents.
 *
 * Architecture:
 *   Password + auth_salt  →  PBKDF2  →  SHA-256  →  auth_verifier (sent to server)
 *   Password + kek_salt   →  PBKDF2  →  KEK (AES-GCM-256, non-extractable, stays in memory)
 *   KEK + IV              →  wraps RSA Private Key  →  wrapped_private_key (stored on server)
 *   RSA Public Key        →  wraps per-file DEKs    →  encrypted_dek (stored on server)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base64 Converters
// ─────────────────────────────────────────────────────────────────────────────

/** Convert an ArrayBuffer or Uint8Array to a Base64 string */
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/** Convert a Base64 string to a Uint8Array */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Salt Generation
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 32-byte salt, returned as Base64 */
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64(salt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Derivation — Split into two independent derivations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the auth verifier from password + auth_salt.
 *
 * This is a hex string that gets sent to the server for authentication.
 * The server then hashes it again with Argon2id before storing it.
 *
 * Flow: password → PBKDF2(salt=auth_salt) → 256 bits → SHA-256 → hex string
 */
export async function deriveAuthVerifier(
  password: string,
  authSaltBase64: string
): Promise<string> {
  const encoder = new TextEncoder();
  const salt = base64ToUint8Array(authSaltBase64);

  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const authBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    256
  );

  // Hash the derived bits to produce the final verifier
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", authBits);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive the Key Encryption Key (KEK) from password + kek_salt.
 *
 * The KEK is an AES-GCM-256 key used to wrap/unwrap the user's RSA private key.
 * It is NON-EXTRACTABLE — it can never be exported from memory, only used for
 * wrapKey/unwrapKey operations. This prevents accidental leakage.
 *
 * Flow: password → PBKDF2(salt=kek_salt) → AES-GCM-256 CryptoKey (non-extractable)
 */
export async function deriveKEK(
  password: string,
  kekSaltBase64: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = base64ToUint8Array(kekSaltBase64);

  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // ← Non-extractable! This is critical for security.
    ["wrapKey", "unwrapKey"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RSA Keypair Operations
// ─────────────────────────────────────────────────────────────────────────────

/** Generate an RSA-OAEP 2048-bit keypair for document key wrapping */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true, // Extractable — we need to export public key and wrap private key
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}

/** Export RSA public key to base64-encoded SPKI format */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

/** Import RSA public key from base64-encoded SPKI format */
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const keyBytes = base64ToUint8Array(spkiBase64);
  return window.crypto.subtle.importKey(
    "spki",
    keyBytes as BufferSource,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Private Key Wrapping / Unwrapping
// ─────────────────────────────────────────────────────────────────────────────

/** Wrap (encrypt) the RSA private key with the KEK using AES-GCM */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  KEK: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await window.crypto.subtle.wrapKey(
    "pkcs8",
    privateKey,
    KEK,
    { name: "AES-GCM", iv }
  );

  return {
    wrappedKey: arrayBufferToBase64(wrapped),
    iv: arrayBufferToBase64(iv),
  };
}

/** Unwrap (decrypt) the RSA private key with the KEK using AES-GCM */
export async function unwrapPrivateKey(
  wrappedKeyBase64: string,
  ivBase64: string,
  KEK: CryptoKey
): Promise<CryptoKey> {
  const wrappedKey = base64ToUint8Array(wrappedKeyBase64);
  const iv = base64ToUint8Array(ivBase64);

  return window.crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey as BufferSource,
    KEK,
    { name: "AES-GCM", iv: iv as BufferSource },
    { name: "RSA-OAEP", hash: "SHA-256" },
    true, // Extractable in memory (needed to derive public key from private)
    ["decrypt", "unwrapKey"]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File Encryption / Decryption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encrypt a file with a random per-file DEK, then wrap the DEK with the user's RSA public key.
 *
 * Output ciphertext format: [12-byte IV] + [AES-GCM encrypted payload]
 */
export async function encryptFile(
  fileBytes: Uint8Array,
  rsaPublicKey: CryptoKey
): Promise<{ ciphertext: Uint8Array; encryptedDek: string }> {
  // Generate a random AES-GCM-256 Data Encryption Key (DEK)
  const dek = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // Extractable — we need to wrap it with RSA
    ["encrypt", "decrypt"]
  );

  // Encrypt the file content with the DEK
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    dek,
    fileBytes as BufferSource
  );

  // Wrap the DEK with the user's RSA public key
  const wrappedDek = await window.crypto.subtle.wrapKey(
    "raw",
    dek,
    rsaPublicKey,
    { name: "RSA-OAEP" }
  );

  // Combine IV + ciphertext into a single buffer
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return {
    ciphertext: combined,
    encryptedDek: arrayBufferToBase64(wrappedDek),
  };
}

/**
 * Decrypt a file by unwrapping the DEK with the user's RSA private key,
 * then decrypting the file payload with the DEK.
 */
export async function decryptFile(
  encryptedPayload: Uint8Array,
  encryptedDekBase64: string,
  rsaPrivateKey: CryptoKey
): Promise<Uint8Array> {
  // Unwrap the DEK
  const wrappedDek = base64ToUint8Array(encryptedDekBase64);
  const dek = await window.crypto.subtle.unwrapKey(
    "raw",
    wrappedDek as BufferSource,
    rsaPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );

  // Extract IV (first 12 bytes) and ciphertext from the payload
  const iv = encryptedPayload.slice(0, 12);
  const ciphertext = encryptedPayload.slice(12);

  // Decrypt
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    dek,
    ciphertext as BufferSource
  );

  return new Uint8Array(decrypted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility — Derive public key from private key (for in-memory use)
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the RSA public key from an RSA private key via JWK round-trip */
export async function getPublicKeyFromPrivateKey(
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
  const publicKeyJwk = {
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
    alg: jwk.alg,
    key_ops: ["encrypt", "wrapKey"],
    ext: true,
  };
  return window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
}
