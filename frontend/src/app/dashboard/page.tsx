"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/app/context";
import {
  apiListDocuments,
  apiUploadDocument,
  apiDownloadDocument,
  apiDeleteDocument,
  DocumentMetadata,
} from "@/lib/api";
import { encryptFile, decryptFile, getPublicKeyFromPrivateKey } from "@/lib/crypto";

// Fallback seed documents for sandbox demo
const DEMO_DOCUMENTS = [
  {
    id: "demo-doc-1",
    owner_id: "demo-user",
    name: "quantum_communications_protocol.md",
    size: 2048,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    content: "This is a secure quantum protocol document detailing E2EE sat downlinks.",
  },
  {
    id: "demo-doc-2",
    owner_id: "demo-user",
    name: "financial_ledger_q2_2026.csv",
    size: 1024,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    content: "TransactionID,Allocation,AmountUSD\nTXN-90212,Offshore R&D,1450000.00\nTXN-90213,Entangled Server Lease,65000.12",
  },
];

export default function DashboardPage() {
  const { user, privateKey, loading: authLoading, logout } = useAuth();
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [demoDocs, setDemoDocs] = useState<any[]>([]);
  const [isSandbox, setIsSandbox] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      logout();
    }
  }, [user, authLoading, logout]);

  // Load documents
  useEffect(() => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;

    async function loadData() {
      setLoadingDocs(true);
      try {
        const docs = await apiListDocuments(currentUser.token);
        setDocuments(docs);
        setIsSandbox(false);
      } catch (err) {
        console.warn("Backend documents API failed or not yet implemented. Falling back to local memory sandbox.", err);
        setIsSandbox(true);
        // Setup local encrypted demo files in memory using the user's private/public key
        try {
          const pubKey = await getPublicKeyFromPrivateKey(currentKey);
          const encoder = new TextEncoder();
          const preparedDemos = await Promise.all(
            DEMO_DOCUMENTS.map(async (doc) => {
              const { ciphertext, encryptedDek } = await encryptFile(
                encoder.encode(doc.content),
                pubKey
              );
              return {
                id: doc.id,
                owner_id: doc.owner_id,
                name: doc.name,
                size: doc.size,
                created_at: doc.created_at,
                updated_at: doc.updated_at,
                encrypted_dek: encryptedDek,
                ciphertext, // Cached locally
              };
            })
          );
          setDemoDocs(preparedDemos);
        } catch (cryptoErr) {
          console.error("Failed to prepare memory sandbox keys", cryptoErr);
        }
      } finally {
        setLoadingDocs(false);
      }
    }

    loadData();
  }, [user, privateKey]);

  if (authLoading || !user || !privateKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB]">
        <div className="text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-sm font-bold tracking-[0.2em] text-[#2B2B2B] animate-pulse">
              LOADING PRIVAULT SECURE CONTEXT
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Handle file encryption and upload
  const handleFileUpload = async (file: File) => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;
    setUploadError(null);
    setUploading(true);
    try {
      // 1. Read file bytes
      const fileBytes = new Uint8Array(await file.arrayBuffer());

      // 2. Generate RSA public key from private key
      const rsaPublicKey = await getPublicKeyFromPrivateKey(currentKey);

      // 3. Encrypt file using Web Crypto
      const { ciphertext, encryptedDek } = await encryptFile(fileBytes, rsaPublicKey);

      if (isSandbox) {
        // Mock save to sandbox state
        const newDoc = {
          id: `sandbox-doc-${Date.now()}`,
          owner_id: currentUser.userId,
          name: file.name,
          size: file.size,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          encrypted_dek: encryptedDek,
          ciphertext,
        };
        setDemoDocs((prev) => [newDoc, ...prev]);
      } else {
        // Send encrypted payload to backend
        const blob = new Blob([ciphertext as any], { type: "application/octet-stream" });
        await apiUploadDocument(currentUser.token, blob, file.name, encryptedDek);
        // Refresh documents from server
        const docs = await apiListDocuments(currentUser.token);
        setDocuments(docs);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to encrypt or upload file.");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Handle download and decrypt
  const handleDownload = async (doc: any) => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;
    try {
      let ciphertext: Uint8Array;

      if (isSandbox) {
        ciphertext = doc.ciphertext;
      } else {
        ciphertext = await apiDownloadDocument(currentUser.token, doc.id);
      }

      // Decrypt the file locally
      const decryptedBytes = await decryptFile(ciphertext, doc.encrypted_dek, currentKey);

      // Trigger standard browser download
      const blob = new Blob([decryptedBytes as any], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Decryption failed: ${err.message}`);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!user) return;
    const currentUser = user;
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      if (isSandbox) {
        setDemoDocs((prev) => prev.filter((d) => d.id !== id));
      } else {
        await apiDeleteDocument(currentUser.token, id);
        // Refresh docs
        const docs = await apiListDocuments(currentUser.token);
        setDocuments(docs);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Filter documents by search query
  const displayedDocs = (isSandbox ? demoDocs : documents).filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F9FAFB] text-[#2B2B2B]">
      {/* Header Panel */}
      <header className="border-b border-[#E5E7EB] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-[0.2em] text-[#2B2B2B]">
              PRIVAULT
            </span>
            <span className="h-2 w-2 bg-[#E41613]"></span>
          </div>

          <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-gray-400">
                Seal Status:
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-600"></span>
                E2EE ACTIVE
              </span>
            </div>

            <div className="hidden h-4 w-px bg-gray-200 sm:block"></div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="break-all text-xs font-semibold uppercase tracking-widest text-[#2B2B2B]">
                Vault: {user.username}
              </span>
              <button
                onClick={logout}
                className="text-xs font-semibold uppercase tracking-wider text-[#2B2B2B] hover:text-[#E41613] hover:underline underline-offset-4"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-light tracking-tight text-[#2B2B2B] sm:text-3xl">
              Document Vault
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Zero-knowledge E2EE document storage. Decryption keys exist only in your browser.
            </p>
          </div>

          {/* Sandbox Indicator */}
          {isSandbox && (
            <div className="inline-flex max-w-full items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse"></span>
              <span className="font-semibold uppercase tracking-wider">
                In-Memory Sandbox Mode
              </span>
            </div>
          )}
        </div>

        {/* Drag & Drop File Upload Panel */}
        <section
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="group relative mb-8 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed border-gray-200 bg-white px-4 py-6 transition-colors hover:border-[#E41613] hover:bg-red-50/10 sm:h-32 sm:min-h-0"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFileChange}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-center">
              <svg
                className="h-5 w-5 animate-spin text-[#E41613]"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wider">
                ENCRYPTING & UPLOADING FILE...
              </span>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wider text-gray-400 group-hover:text-[#E41613]">
                Drag files here or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Files are AES-GCM encrypted in the browser before leaving your machine
              </p>
            </div>
          )}
          {uploadError && (
            <p className="mt-3 text-center text-xs font-semibold text-[#E41613] sm:absolute sm:bottom-2">
              {uploadError}
            </p>
          )}
        </section>

        {/* Filter & Table Area */}
        <section className="border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-6">
          {/* Search bar */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="FILTER DOCUMENTS BY NAME..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border-b border-gray-200 py-2 text-xs uppercase tracking-wider outline-none focus:border-[#E41613] placeholder:text-gray-300"
            />
          </div>

          {/* Documents Table */}
          {loadingDocs ? (
            <div className="py-12 text-center text-xs text-gray-400">
              LOADING ENCRYPTED METADATA...
            </div>
          ) : displayedDocs.length === 0 ? (
            <div className="py-12 text-center text-xs tracking-wider uppercase text-gray-300">
              No secure documents found in this vault
            </div>
          ) : (
            <div>
              <table className="doc-table w-full text-left text-sm">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-[#E5E7EB] text-xs font-semibold uppercase tracking-wider text-gray-400">
                    <th className="pb-3 pr-4 font-semibold">Name</th>
                    <th className="pb-3 pr-4 font-semibold">Size</th>
                    <th className="pb-3 pr-4 font-semibold">Seal Date</th>
                    <th className="pb-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayedDocs.map((doc) => (
                    <tr key={doc.id} className="group hover:bg-gray-50/50 sm:table-row">
                      <td data-label="Name" className="py-4 pr-4 font-medium text-[#2B2B2B]">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-gray-300"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            ></path>
                          </svg>
                          <span className="min-w-0 break-all sm:truncate sm:max-w-md">
                            {doc.name}
                          </span>
                        </div>
                      </td>
                      <td data-label="Size" className="py-4 pr-4 text-xs text-gray-400 font-mono">
                        {formatSize(doc.size)}
                      </td>
                      <td data-label="Seal Date" className="py-4 pr-4 text-xs text-gray-400">
                        {formatDate(doc.created_at)}
                      </td>
                      <td data-label="Actions" className="py-4 text-right">
                        <div className="flex flex-wrap justify-start gap-4 sm:justify-end">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="text-xs font-semibold uppercase tracking-wider text-[#2B2B2B] hover:text-[#E41613] hover:underline underline-offset-4"
                          >
                            Download & Decrypt
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
