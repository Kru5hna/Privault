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
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolderMetadata {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
}

export interface ShareLinkMetadata {
  id: string;
  document_id: string;
  document_name: string;
  document_size: number;
  encrypted_dek: string;
  expires_at: string | null;
  download_limit: number | null;
  downloads_count: number;
  created_at: string | null;
}

export interface TagMetadata {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: string;
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
  token: string,
  folderId?: string | null
): Promise<DocumentMetadata[]> {
  const url = folderId 
    ? `${API_BASE_URL}/api/documents?folder_id=${folderId}`
    : `${API_BASE_URL}/api/documents`;
    
  const res = await fetch(url, {
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
  encryptedDek: string,
  folderId?: string | null
): Promise<{ id: string; message: string }> {
  const formData = new FormData();
  formData.append("file", fileBlob, fileName);
  formData.append("name", fileName);
  formData.append("encrypted_dek", encryptedDek);
  if (folderId) {
    formData.append("folder_id", folderId);
  }

  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Folder Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** Create a new folder */
export async function apiCreateFolder(
  token: string,
  name: string,
  parentId?: string | null
): Promise<FolderMetadata> {
  const res = await fetch(`${API_BASE_URL}/api/folders`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name, parent_id: parentId || null }),
  });
  return handleResponse(res);
}

/** Fetch all folders, optionally scoped to a parent folder */
export async function apiListFolders(
  token: string,
  parentId?: string | null
): Promise<FolderMetadata[]> {
  const url = parentId 
    ? `${API_BASE_URL}/api/folders?parent_id=${parentId}`
    : `${API_BASE_URL}/api/folders`;
    
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

/** Rename a folder */
export async function apiRenameFolder(
  token: string,
  folderId: string,
  newName: string
): Promise<FolderMetadata> {
  const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ name: newName }),
  });
  return handleResponse(res);
}

/** Delete a folder */
export async function apiDeleteFolder(
  token: string,
  folderId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag Endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function apiCreateTag(
  token: string,
  name: string,
  color?: string
): Promise<TagMetadata> {
  const res = await fetch(`${API_BASE_URL}/api/tags`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ name, color }),
  });
  return handleResponse(res);
}

export async function apiListTags(token: string): Promise<TagMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/tags`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function apiDeleteTag(
  token: string,
  tagId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/tags/${tagId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function apiTagDocument(
  token: string,
  documentId: string,
  tagId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/tags/document/${documentId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ tag_id: tagId }),
  });
  return handleResponse(res);
}

export async function apiUntagDocument(
  token: string,
  documentId: string,
  tagId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/tags/document/${documentId}/${tagId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function apiListDocumentTags(
  token: string,
  documentId: string
): Promise<TagMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/tags/document/${documentId}`, {
    method: "GET",
    headers: authHeaders(token),
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

// ─────────────────────────────────────────────────────────────────────────────
// Share Link Endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function apiCreateShareLink(
  token: string,
  documentId: string,
  encryptedDek: string,
  expiresAt?: string | null,
  downloadLimit?: number | null
): Promise<ShareLinkMetadata> {
  const res = await fetch(`${API_BASE_URL}/api/shares`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      document_id: documentId,
      encrypted_dek: encryptedDek,
      expires_at: expiresAt || null,
      download_limit: downloadLimit || null,
    }),
  });
  return handleResponse(res);
}

export async function apiGetShareLink(shareId: string): Promise<ShareLinkMetadata> {
  const res = await fetch(`${API_BASE_URL}/api/shares/${shareId}`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function apiDownloadSharedDocument(shareId: string): Promise<Uint8Array> {
  const res = await fetch(`${API_BASE_URL}/api/shares/${shareId}/download`, {
    method: "GET",
    headers: authHeaders(),
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

export async function apiRevokeShareLink(
  token: string,
  shareId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/shares/${shareId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export async function apiListMyShareLinks(token: string): Promise<ShareLinkMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/shares/mine`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

/** Fetch all folders recursively (no parent scoping) */
export async function apiListAllFolders(token: string): Promise<FolderMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/folders/all`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

export interface FolderStats {
  file_count: number;
  subfolder_count: number;
}

/** Get folder statistics recursively */
export async function apiGetFolderStats(
  folderId: string,
  token: string
): Promise<FolderStats> {
  const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}/stats`, {
    method: "GET",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

/** Delete all documents in a folder */
export async function apiDeleteFolderDocuments(
  token: string,
  folderId: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/documents/folder/${folderId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return handleResponse(res);
}

