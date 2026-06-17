/**
 * Client-side End-to-End Encryption (E2EE) engine for Privault
 * Utilizes the browser's built-in Web Crypto API (window.crypto.subtle)
 */

// Converter: ArrayBuffer or Uint8Array -> Base64 string
export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return window.btoa(binary);
}

// Converter: Base64 string -> Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Generate a deterministic salt based on the username to ensure uniqueness across users
export async function getSalt(username: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(username.toLowerCase() + "_privault_salt_constant");
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

/**
 * Derives the auth_hash (for server login) and the KEK (for wrapping the private key)
 * from the user's master password and username.
 */
export async function deriveCredentials(
  username: string,
  password: string
): Promise<{ KEK: CryptoKey; authHash: string }> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const salt = await getSalt(username);

  // Import the raw password as a PBKDF2 base key
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey", "deriveBits"]
  );

  // Derive the Key Encryption Key (KEK) for private key wrapping (AES-GCM-256)
  const KEK = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, // Non-extractable for memory safety
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"]
  );

  // Derive bits for the auth_hash (256 bits = 32 bytes)
  const authBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    256
  );

  // Hash the derived bits to get a final secure auth_hash hex string
  const authHashBuffer = await window.crypto.subtle.digest("SHA-256", authBits);
  const authHash = Array.from(new Uint8Array(authHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { KEK, authHash };
}

/**
 * Generates an asymmetric RSA-OAEP 2048 keypair for document key wrapping
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true, // Extractable so we can export the public key and wrap the private key
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );
}

/**
 * Exports the RSA public key to base64 SPKI string format
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey("spki", key);
  return arrayBufferToBase64(exported);
}

/**
 * Imports the RSA public key from a base64 SPKI string format
 */
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const keyBytes = base64ToUint8Array(spkiBase64);
  return window.crypto.subtle.importKey(
    "spki",
    keyBytes as any,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
}

/**
 * Wraps (encrypts) the user's RSA private key using their password-derived KEK
 * Returns the wrapped key in base64 along with the initialization vector (IV)
 */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  KEK: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await window.crypto.subtle.wrapKey(
    "pkcs8",
    privateKey,
    KEK,
    { name: "AES-GCM", iv: iv as any }
  );

  return {
    wrappedKey: arrayBufferToBase64(wrapped),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Unwraps (decrypts) the user's RSA private key using their password-derived KEK
 */
export async function unwrapPrivateKey(
  wrappedKeyBase64: string,
  ivBase64: string,
  KEK: CryptoKey
): Promise<CryptoKey> {
  const wrappedKey = base64ToUint8Array(wrappedKeyBase64);
  const iv = base64ToUint8Array(ivBase64);

  return window.crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey as any,
    KEK,
    { name: "AES-GCM", iv: iv as any },
    { name: "RSA-OAEP", hash: "SHA-256" },
    true, // Extractable in memory
    ["decrypt", "unwrapKey"]
  );
}

/**
 * Encrypts file bytes with a random AES-GCM DEK, and wraps the DEK with the user's RSA public key.
 * The output ciphertext buffer contains: [12-byte IV] + [encrypted file payload]
 */
export async function encryptFile(
  fileBytes: Uint8Array,
  rsaPublicKey: CryptoKey
): Promise<{ ciphertext: Uint8Array; encryptedDek: string }> {
  // 1. Generate a single-use random AES-GCM-256 key (DEK)
  const dek = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt the file content
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedFileBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    dek,
    fileBytes as any
  );

  // 3. Wrap (encrypt) the DEK using the User's RSA Public Key
  const wrappedDek = await window.crypto.subtle.wrapKey(
    "raw",
    dek,
    rsaPublicKey,
    { name: "RSA-OAEP" }
  );

  // 4. Prepend IV (12 bytes) to the encrypted payload for simple bundling
  const combined = new Uint8Array(iv.length + encryptedFileBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedFileBuffer), iv.length);

  return {
    ciphertext: combined,
    encryptedDek: arrayBufferToBase64(wrappedDek),
  };
}

/**
 * Decrypts file bytes using the user's RSA private key to unwrap the DEK first.
 */
export async function decryptFile(
  encryptedPayload: Uint8Array,
  encryptedDekBase64: string,
  rsaPrivateKey: CryptoKey
): Promise<Uint8Array> {
  // 1. Unwrap the DEK using the Private Key
  const wrappedDek = base64ToUint8Array(encryptedDekBase64);
  const dek = await window.crypto.subtle.unwrapKey(
    "raw",
    wrappedDek as any,
    rsaPrivateKey,
    { name: "RSA-OAEP" },
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );

  // 2. Extract IV (first 12 bytes) and ciphertext
  const iv = encryptedPayload.slice(0, 12);
  const ciphertext = encryptedPayload.slice(12);

  // 3. Decrypt the file bytes
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as any },
    dek,
    ciphertext as any
  );

  return new Uint8Array(decrypted);
}

/**
 * Derives the RSA public key from the RSA private key in-memory by exporting to JWK
 */
export async function getPublicKeyFromPrivateKey(privateKey: CryptoKey): Promise<CryptoKey> {
  const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
  const publicKeyJwk = {
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
    alg: jwk.alg,
    key_ops: ["encrypt"],
    ext: true
  };
  return window.crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt", "wrapKey"]
  );
}
