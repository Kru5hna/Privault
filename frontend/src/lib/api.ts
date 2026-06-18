/**
 * API client for communicating with the Privault Axum backend.
 *
 * All functions throw on error with a descriptive message.
 * Session tokens are passed explicitly — no global state here.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal session info stored client-side (no key material!) */
export interface UserSession {
  sessionToken: string;
  userId: string;
  username: string;
  publicKey: string;
  kekSalt: string;
  wrappedPrivateKey: string;
  wrappedPrivateKeyIv: string;
}

export interface DocumentMetadata {
  id: string;
  owner_id: string;
  name: string;
  encrypted_dek: string;
  size: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Response Handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      errorMessage = body.error || body.message || errorMessage;
    } catch {
      try {
        errorMessage = await res.text();
      } catch {
        // Use default error message
      }
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

/** Build headers with optional Bearer token */
function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the user's salts (public endpoint, needed before login) */
export async function apiGetSalts(
  username: string
): Promise<{ auth_salt: string; kek_salt: string }> {
  const res = await fetch(
    `${API_BASE_URL}/api/auth/salt/${encodeURIComponent(username)}`
  );
  return handleResponse(res);
}

/** Register a new user with client-derived crypto material */
export async function apiRegister(
  username: string,
  authVerifier: string,
  authSalt: string,
  kekSalt: string,
  publicKey: string,
  wrappedPrivateKey: string,
  wrappedPrivateKeyIv: string
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      auth_verifier: authVerifier,
      auth_salt: authSalt,
      kek_salt: kekSalt,
      public_key: publicKey,
      wrapped_private_key: wrappedPrivateKey,
      wrapped_private_key_iv: wrappedPrivateKeyIv,
    }),
  });
  return handleResponse(res);
}

/** Log in and receive a session token + wrapped key material */
export async function apiLogin(
  username: string,
  authVerifier: string
): Promise<{
  message: string;
  session_token: string;
  user_id: string;
  username: string;
  wrapped_private_key: string;
  wrapped_private_key_iv: string;
  public_key: string;
  kek_salt: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      auth_verifier: authVerifier,
    }),
  });
  return handleResponse(res);
}

/** Log out — revokes all sessions for the user */
export async function apiLogout(sessionToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders(sessionToken),
  });
  await handleResponse(res);
}

/** Verify session validity and get user profile */
export async function apiGetMe(
  sessionToken: string
): Promise<{ user_id: string; username: string }> {
  const res = await fetch(`${API_BASE_URL}/api/me`, {
    method: "GET",
    headers: authHeaders(sessionToken),
  });
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch all documents owned by the current user */
export async function apiListDocuments(
  token: string
): Promise<DocumentMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

/** Upload an encrypted document to the server */
export async function apiUploadDocument(
  token: string,
  fileBlob: Blob,
  fileName: string,
  encryptedDek: string
): Promise<{ id: string; message: string }> {
  const formData = new FormData();
  formData.append("file", fileBlob, fileName);
  formData.append("name", fileName);
  formData.append("encrypted_dek", encryptedDek);

  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return handleResponse(res);
}

/** Download raw encrypted document bytes from the server */
export async function apiDownloadDocument(
  token: string,
  documentId: string
): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "GET",
    headers: authHeaders(token),
  });

  if (!res.ok) {
    let errorMessage = "Download failed";
    try {
      const body = await res.json();
      errorMessage = body.error || body.message || errorMessage;
    } catch {
      // Use default
    }
    throw new Error(errorMessage);
  }

  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/** Delete a document from the server */
export async function apiDeleteDocument(
  token: string,
  documentId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}
