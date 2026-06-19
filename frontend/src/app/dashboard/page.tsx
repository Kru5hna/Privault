"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/app/context";
import {
  apiListDocuments,
  apiUploadDocument,
  apiDownloadDocument,
  apiDeleteDocument,
  apiCreateFolder,
  apiListFolders,
  apiDeleteFolder,
  DocumentMetadata,
  FolderMetadata,
} from "@/lib/api";
import { encryptFile, decryptFile, getPublicKeyFromPrivateKey } from "@/lib/crypto";
import { ScrambledText } from "@/components/scrambled-text";

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
  const { user, privateKey, status, logout } = useAuth();
  const authLoading = status === "loading";
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [folders, setFolders] = useState<FolderMetadata[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string | null, name: string}[]>([{id: null, name: "Root"}]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [demoDocs, setDemoDocs] = useState<any[]>([]);
  const [isSandbox, setIsSandbox] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      logout();
    }
  }, [user, authLoading, logout]);

  // Load documents and folders
  useEffect(() => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;

    async function loadData() {
      setLoadingDocs(true);
      try {
        const [docs, fldrs] = await Promise.all([
          apiListDocuments(currentUser.sessionToken, currentFolderId),
          apiListFolders(currentUser.sessionToken, currentFolderId)
        ]);
        setDocuments(docs);
        setFolders(fldrs);
        setIsSandbox(false);
      } catch (err) {
        console.warn("Backend documents API failed or not yet implemented. Falling back to local memory sandbox.", err);
        setIsSandbox(true);
        // Setup local encrypted demo files in memory using the user's private/public key
        if (currentFolderId === null) {
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
        } else {
            setDemoDocs([]);
        }
      } finally {
        setLoadingDocs(false);
      }
    }

    loadData();
  }, [user, privateKey, currentFolderId]);

  if (authLoading || !user || !privateKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0]">
        <div className="text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-xs font-bold tracking-[0.25em] text-white/50 animate-pulse">
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
        await apiUploadDocument(currentUser.sessionToken, blob, file.name, encryptedDek, currentFolderId);
        // Refresh documents from server
        const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
        setDocuments(docs);
      }
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || "Failed to encrypt or upload file.");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newFolderName.trim()) return;
    try {
      if (isSandbox) {
         alert("Folders are not supported in sandbox mode.");
         setIsCreatingFolder(false);
         setNewFolderName("");
         return;
      }
      await apiCreateFolder(user.sessionToken, newFolderName.trim(), currentFolderId);
      const fldrs = await apiListFolders(user.sessionToken, currentFolderId);
      setFolders(fldrs);
      setIsCreatingFolder(false);
      setNewFolderName("");
    } catch (err: any) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  const handleNavigateToFolder = (folderId: string | null, folderName: string) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderPath([{id: null, name: "Root"}]);
    } else {
      // If we are clicking a breadcrumb, we truncate the path
      const existingIdx = folderPath.findIndex(f => f.id === folderId);
      if (existingIdx >= 0) {
        setFolderPath(folderPath.slice(0, existingIdx + 1));
      } else {
        setFolderPath([...folderPath, {id: folderId, name: folderName}]);
      }
    }
    setSearchQuery("");
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
     if (!user) return;
     if (!confirm(`Are you sure you want to delete the folder "${folderName}" and ALL its contents? This cannot be undone.`)) return;
     try {
       await apiDeleteFolder(user.sessionToken, folderId);
       const fldrs = await apiListFolders(user.sessionToken, currentFolderId);
       setFolders(fldrs);
     } catch (err: any) {
       alert(`Delete folder failed: ${err.message}`);
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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDropWithState = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
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
        ciphertext = await apiDownloadDocument(currentUser.sessionToken, doc.id);
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
        await apiDeleteDocument(currentUser.sessionToken, id);
        // Refresh docs
        const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
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
    <div className="flex min-h-screen flex-col bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

      {/* Header Panel */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#15161A]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-serif text-xl font-bold tracking-[0.25em] text-[#F5F5F0]">
              PRIVAULT
            </span>
            <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
          </div>

          <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-white/30">
                Seal Status:
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
                E2EE ACTIVE
              </span>
            </div>

            <div className="hidden h-4 w-px bg-white/10 sm:block"></div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="break-all text-xs font-semibold uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 px-3 py-1.5">
                Vault: {user.username}
              </span>
              <button
                onClick={logout}
                className="text-xs font-bold uppercase tracking-widest text-[#E41613] hover:text-white border border-[#E41613]/30 hover:border-[#E41613] px-3.5 py-1.5 transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-light tracking-wide text-white sm:text-3xl">
              Document Vault
            </h1>
            
            {/* Breadcrumb Navigation */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium tracking-wider text-white/50">
              {folderPath.map((crumb, idx) => (
                <React.Fragment key={crumb.id || "root"}>
                  {idx > 0 && <span className="text-white/20">/</span>}
                  <button
                    onClick={() => handleNavigateToFolder(crumb.id, crumb.name)}
                    className={`hover:text-white transition-colors cursor-pointer ${idx === folderPath.length - 1 ? "text-white" : ""}`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Sandbox Indicator */}
          {isSandbox && (
            <div className="inline-flex max-w-full items-center gap-2 border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="font-semibold uppercase tracking-wider">
                In-Memory Sandbox Mode
              </span>
            </div>
          )}
        </div>

        {/* Drag & Drop File Upload Panel */}
        <section
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDropWithState}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative mb-8 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed transition-all duration-300 rounded-none ${
            isDragActive
              ? "border-[#E41613] bg-[#E41613]/5 scale-[0.99] shadow-[0_0_24px_rgba(228,22,19,0.15)]"
              : "border-white/10 bg-[#15161A] hover:border-[#E41613] hover:bg-white/[0.01]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFileChange}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <svg
                className="h-6 w-6 animate-spin text-[#E41613]"
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
              <span className="text-micro font-bold tracking-[0.2em] text-[#E41613]">
                ENCRYPTING & UPLOADING FILE...
              </span>
            </div>
          ) : (
            <div className="text-center p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-white/60 group-hover:text-white transition-colors duration-300">
                Drag files here or click to browse
              </p>
              <p className="mt-2 text-xs text-white/30 tracking-wide">
                Files are AES-256-GCM encrypted in the browser before leaving your machine
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
        <section className="panel-card p-4 sm:p-8">
          {/* Search bar and Action bar */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Filter documents by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full input-tactical py-2.5 text-xs font-semibold tracking-wider pl-10 focus-crimson"
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            
            <div className="flex shrink-0">
               {!isSandbox && !isCreatingFolder && (
                 <button 
                   onClick={() => setIsCreatingFolder(true)}
                   className="btn-outline px-4 cursor-pointer"
                 >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg>
                   New Folder
                 </button>
               )}
            </div>
          </div>

          {/* New Folder Inline Form */}
          {isCreatingFolder && (
            <div className="mb-6 p-4 border border-[#E41613]/30 bg-[#E41613]/5 flex flex-col sm:flex-row gap-4 items-center">
               <svg className="w-5 h-5 text-[#E41613] hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>
               <form onSubmit={handleCreateFolder} className="flex flex-1 w-full gap-4">
                 <input 
                   autoFocus
                   type="text" 
                   value={newFolderName}
                   onChange={e => setNewFolderName(e.target.value)}
                   placeholder="Folder Name"
                   className="input-tactical py-2 px-3 text-xs flex-1"
                 />
                 <button type="submit" className="btn-primary shrink-0">
                    <span className="btn-bg"></span>
                    <span className="btn-text">Create</span>
                 </button>
                 <button type="button" onClick={() => setIsCreatingFolder(false)} className="text-xs uppercase font-bold text-white/50 hover:text-white cursor-pointer px-2 shrink-0 tracking-widest">
                   Cancel
                 </button>
               </form>
            </div>
          )}

          {/* Documents Table */}
          {loadingDocs ? (
            <div className="py-16 text-center text-xs tracking-widest uppercase text-white/30 animate-pulse">
              LOADING ENCRYPTED METADATA...
            </div>
          ) : displayedDocs.length === 0 ? (
            <div className="py-16 text-center text-xs tracking-widest uppercase text-white/20">
              No secure documents found in this vault
            </div>
          ) : (
            <div>
              <table className="doc-table w-full text-left text-sm border-collapse">
                <thead className="hidden sm:table-header-group">
                  <tr className="border-b border-white/5 text-micro font-semibold text-white/40 tracking-[0.2em]">
                    <th className="pb-4 pr-4 font-bold">Name</th>
                    <th className="pb-4 pr-4 font-bold">Size</th>
                    <th className="pb-4 pr-4 font-bold">Seal Date</th>
                    <th className="pb-4 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {/* Render Folders First */}
                  {!searchQuery && folders.map((folder) => (
                    <tr key={folder.id} className="group border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.01] transition-colors sm:table-row">
                      <td data-label="Name" className="py-4 pr-4 text-sm text-white/95">
                        <div 
                           className="flex items-center gap-3 cursor-pointer group-hover:text-[#E41613] transition-colors"
                           onClick={() => handleNavigateToFolder(folder.id, folder.name)}
                        >
                          <svg className="h-4 w-4 text-white/40 group-hover:text-[#E41613] shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                          </svg>
                          <span className="min-w-0 break-all sm:truncate sm:max-w-md font-bold">
                            {folder.name}
                          </span>
                        </div>
                      </td>
                      <td data-label="Size" className="py-4 pr-4 text-xs text-white/40 font-mono">
                        --
                      </td>
                      <td data-label="Seal Date" className="py-4 pr-4 text-xs text-white/40">
                        {formatDate(folder.created_at)}
                      </td>
                      <td data-label="Actions" className="py-4 text-right">
                        <div className="flex flex-wrap justify-start gap-8 sm:justify-end items-center">
                           <button
                            onClick={() => handleDeleteFolder(folder.id, folder.name)}
                            className="text-xs font-bold uppercase tracking-widest text-[#E41613]/50 hover:text-[#E41613] transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Render Files */}
                  {displayedDocs.map((doc) => (
                    <tr key={doc.id} className="group border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.01] transition-colors sm:table-row">
                      <td data-label="Name" className="py-4 pr-4 text-sm text-white/95">
                        <div className="flex items-center gap-3">
                          <svg
                            className="h-4 w-4 text-[#E41613] shrink-0"
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
                          <span className="min-w-0 break-all sm:truncate sm:max-w-md font-medium">
                            <ScrambledText text={doc.name} delay={20} />
                          </span>
                        </div>
                      </td>
                      <td data-label="Size" className="py-4 pr-4 text-xs text-white/40 font-mono">
                        {formatSize(doc.size)}
                      </td>
                      <td data-label="Seal Date" className="py-4 pr-4 text-xs text-white/40">
                        {formatDate(doc.created_at)}
                      </td>
                      <td data-label="Actions" className="py-4 text-right">
                        <div className="flex flex-wrap justify-start gap-8 sm:justify-end items-center">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer"
                          >
                            Download & Decrypt
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="btn-delete-tactical relative cursor-pointer"
                          >
                            <span className="btn-bg" />
                            <span className="btn-text">Delete</span>
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
