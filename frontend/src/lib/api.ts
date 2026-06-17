/**
 * API client wrapper for communicating with the Axum backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface UserSession {
  token: string;
  userId: string;
  username: string;
  wrappedPrivateKey: string;
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

/**
 * Handle HTTP response status checking
 */
async function checkResponse(res: Response): Promise<any> {
  if (!res.ok) {
    let errorMessage = "Request failed";
    try {
      const errorJson = await res.json();
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch {
      try {
        errorMessage = await res.text();
      } catch {}
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

/**
 * Register a new user with client-derived credentials and key pair
 */
export async function apiRegister(
  username: string,
  authHash: string,
  publicKey: string,
  wrappedPrivateKey: string
): Promise<{ id: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      auth_hash: authHash,
      public_key: publicKey,
      wrapped_private_key: wrappedPrivateKey,
    }),
  });
  return checkResponse(res);
}

/**
 * Log in a user with username and auth hash
 */
export async function apiLogin(
  username: string,
  authHash: string
): Promise<{ message: string; user_id: string; wrapped_private_key: string; token: string }> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      auth_hash: authHash,
    }),
  });
  return checkResponse(res);
}

/**
 * Verify JWT token validity and fetch user profile
 */
export async function apiGetMe(token: string): Promise<{ message: string; user_id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return checkResponse(res);
}

/**
 * Fetch all documents owned by the current user
 */
export async function apiListDocuments(token: string): Promise<DocumentMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return checkResponse(res);
}

/**
 * Upload an encrypted document to the server
 */
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  return checkResponse(res);
}

/**
 * Download raw encrypted document bytes from the server
 */
export async function apiDownloadDocument(token: string, documentId: string): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let errorMessage = "Download failed";
    try {
      const errorJson = await res.json();
      errorMessage = errorJson.message || errorJson.error || errorMessage;
    } catch {}
    throw new Error(errorMessage);
  }

  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Delete a document from the server
 */
export async function apiDeleteDocument(token: string, documentId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return checkResponse(res);
}
