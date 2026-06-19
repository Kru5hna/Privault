"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/app/context";
import {
  apiListDocuments,
  apiUploadDocument,
  apiDownloadDocument,
  apiDeleteDocument,
  apiCreateFolder,
  apiDeleteFolder,
  apiRenameFolder,
  apiListTags,
  apiListDocumentTags,
  apiListAllFolders,
  DocumentMetadata,
  FolderMetadata,
  TagMetadata,
} from "@/lib/api";
import { encryptFile, decryptFile, getPublicKeyFromPrivateKey } from "@/lib/crypto";
import { ScrambledText } from "@/components/scrambled-text";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { TagBadge } from "@/components/tag-badge";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { FolderSidebar } from "@/components/folder-sidebar";
import { ShareModal } from "@/components/share-modal";
import { SharedLinksPanel } from "@/components/shared-links-panel";
import { Menu, Share2 } from "lucide-react";
import { toast } from "sonner";

interface SandboxDocument extends DocumentMetadata {
  ciphertext?: Uint8Array;
}

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
  const [allFolders, setAllFolders] = useState<FolderMetadata[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string | null, name: string}[]>([{id: null, name: "Root"}]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null);
  const [shareDoc, setShareDoc] = useState<DocumentMetadata | null>(null);
  const [viewMode, setViewMode] = useState<"vault" | "shares">("vault");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [allTags, setAllTags] = useState<TagMetadata[]>([]);
  const [docTagsCache, setDocTagsCache] = useState<Record<string, TagMetadata[]>>({});
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{name: string} | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);

  const [demoDocs, setDemoDocs] = useState<SandboxDocument[]>([]);
  const [isSandbox, setIsSandbox] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploadState, setUploadState] = useState<"idle" | "encrypting" | "uploading" | "complete">("idle");
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
        const [docs, fldrs, tags] = await Promise.all([
          apiListDocuments(currentUser.sessionToken, currentFolderId),
          apiListAllFolders(currentUser.sessionToken),
          apiListTags(currentUser.sessionToken)
        ]);
        setDocuments(docs);
        setAllFolders(fldrs);
        setAllTags(tags);
        setIsSandbox(false);
        
        // Fetch tags for all docs in view concurrently
        const docTagsObj: Record<string, TagMetadata[]> = {};
        await Promise.all(
          docs.map(async (d) => {
            try {
              const dt = await apiListDocumentTags(currentUser.sessionToken, d.id);
              docTagsObj[d.id] = dt;
            } catch {
              docTagsObj[d.id] = [];
            }
          })
        );
        setDocTagsCache(docTagsObj);
        
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
                    folder_id: null,
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
    setUploadState("encrypting");
    try {
      // 1. Read file bytes
      const fileBytes = new Uint8Array(await file.arrayBuffer());

      // 2. Generate RSA public key from private key
      const rsaPublicKey = await getPublicKeyFromPrivateKey(currentKey);

      // 3. Encrypt file using Web Crypto
      const { ciphertext, encryptedDek } = await encryptFile(fileBytes, rsaPublicKey);

      setUploadState("uploading");

      if (isSandbox) {
        // Mock save to sandbox state
        const newDoc: SandboxDocument = {
          id: `sandbox-doc-${Date.now()}`,
          owner_id: currentUser.userId,
          name: file.name,
          size: file.size,
          folder_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          encrypted_dek: encryptedDek,
          ciphertext,
        };
        setDemoDocs((prev) => [newDoc, ...prev]);
      } else {
        // Send encrypted payload to backend
        const blob = new Blob([ciphertext as unknown as BlobPart], { type: "application/octet-stream" });
        await apiUploadDocument(currentUser.sessionToken, blob, file.name, encryptedDek, currentFolderId);
        // Refresh documents from server
        const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
        setDocuments(docs);
      }
      
      setUploadState("complete");
      setTimeout(() => {
         setUploadState("idle");
      }, 2000);
      
    } catch (err: unknown) {
      console.error(err);
      const errorObject = err as Error;
      setUploadError(errorObject?.message || "Failed to encrypt or upload file.");
      setUploadState("idle");
    }
  };

  const handleCreateFolderSidebar = async (name: string, parentId: string | null) => {
    if (!user) return;
    try {
      if (isSandbox) {
         toast.error("Folders are not supported in sandbox mode.");
         return;
      }
      await apiCreateFolder(user.sessionToken, name, parentId);
      const fldrs = await apiListAllFolders(user.sessionToken);
      setAllFolders(fldrs);
      toast.success("Folder created successfully");
    } catch (err: unknown) {
      const errorObject = err as Error;
      toast.error(`Failed to create folder: ${errorObject?.message || "Unknown error"}`);
    }
  };

  const handleDeleteFolderSidebar = async (folderId: string) => {
    if (!user) return;
    try {
      await apiDeleteFolder(user.sessionToken, folderId);
      if (currentFolderId === folderId) {
        setCurrentFolderId(null);
        setFolderPath([{ id: null, name: "Root" }]);
      }
      const fldrs = await apiListAllFolders(user.sessionToken);
      setAllFolders(fldrs);
      toast.success("Folder deleted securely");
    } catch (err: unknown) {
      const errorObject = err as Error;
      toast.error(`Delete folder failed: ${errorObject?.message || "Unknown error"}`);
    }
  };

  const handleRenameFolderSidebar = async (folderId: string, newName: string) => {
    if (!user) return;
    try {
      await apiRenameFolder(user.sessionToken, folderId, newName);
      const fldrs = await apiListAllFolders(user.sessionToken);
      setAllFolders(fldrs);
      toast.success("Folder renamed successfully");
    } catch (err: unknown) {
      const errorObject = err as Error;
      toast.error(`Rename folder failed: ${errorObject?.message || "Unknown error"}`);
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
  const handleDownload = async (doc: SandboxDocument) => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;
    try {
      let ciphertext: Uint8Array;

      if (isSandbox) {
        ciphertext = doc.ciphertext || new Uint8Array();
      } else {
        ciphertext = await apiDownloadDocument(currentUser.sessionToken, doc.id);
      }

      // Decrypt the file locally
      const decryptedBytes = await decryptFile(ciphertext, doc.encrypted_dek, currentKey);

      // Trigger standard browser download
      const blob = new Blob([decryptedBytes as unknown as BlobPart], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const errorObject = err as Error;
      toast.error(`Decryption failed: ${errorObject?.message || "Unknown error"}`);
    }
  };

  // Handle preview in browser
  const handlePreview = async (doc: SandboxDocument) => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;
    
    setPreviewDoc({ name: doc.name });
    setPreviewBytes(null); // Will show loading spinner in modal
    
    try {
      let ciphertext: Uint8Array;
      if (isSandbox) {
        ciphertext = doc.ciphertext || new Uint8Array();
      } else {
        ciphertext = await apiDownloadDocument(currentUser.sessionToken, doc.id);
      }
      
      const decryptedBytes = await decryptFile(ciphertext, doc.encrypted_dek, currentKey);
      setPreviewBytes(decryptedBytes);
    } catch (err: unknown) {
      const errorObject = err as Error;
      toast.error(`Preview failed: ${errorObject?.message || "Unknown error"}`);
      setPreviewDoc(null);
    }
  };

  // Handle delete
  const handleDelete = (id: string) => {
    if (!user) return;
    const currentUser = user;
    
    toast.error("Permanently delete this document?", {
       icon: null,
       action: {
         label: 'Confirm Delete',
         onClick: async () => {
           try {
             if (isSandbox) {
               setDemoDocs((prev) => prev.filter((d) => d.id !== id));
             } else {
               await apiDeleteDocument(currentUser.sessionToken, id);
               // Refresh docs
               const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
               setDocuments(docs);
               toast.success("Document deleted securely");
             }
           } catch (err: unknown) {
             const errorObject = err as Error;
             toast.error(`Delete failed: ${errorObject?.message || "Unknown error"}`);
           }
         }
       },
       cancel: {
         label: 'Cancel',
         onClick: () => {}
       },
       duration: 10000,
    });
  };

  // Filter documents by search query and tags
  const displayedDocs = (isSandbox ? demoDocs : documents).filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedTagFilter) {
       const hasTag = docTagsCache[doc.id]?.some((t: TagMetadata) => t.id === selectedTagFilter);
       return matchesSearch && hasTag;
    }
    return matchesSearch;
  });

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
    <div className="flex min-h-screen bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative overflow-x-hidden w-full">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

      {/* Collapsible Sidebar */}
      <FolderSidebar
        folders={allFolders}
        currentFolderId={currentFolderId}
        onSelectFolder={(folderId, path) => {
          setCurrentFolderId(folderId);
          setFolderPath(path);
          setSearchQuery("");
        }}
        onCreateFolder={handleCreateFolderSidebar}
        onDeleteFolder={handleDeleteFolderSidebar}
        onRenameFolder={handleRenameFolderSidebar}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main panel container */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Header Panel */}
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#15161A]/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 -ml-1.5 text-[#8E929F] hover:text-white rounded hover:bg-white/5 md:hidden cursor-pointer"
              >
                <Menu size={20} />
              </button>
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
                <span className="break-all text-xs font-semibold uppercase tracking-widest text-[#F5F5F0]/70 bg-white/5 border border-white/10 px-3 py-1.5">
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

        {/* Dynamic view modes */}
        {viewMode === "vault" ? (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
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
                        onClick={() => {
                          setCurrentFolderId(crumb.id);
                          const existingIdx = folderPath.findIndex((f) => f.id === crumb.id);
                          if (existingIdx >= 0) {
                            setFolderPath(folderPath.slice(0, existingIdx + 1));
                          }
                          setSearchQuery("");
                        }}
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
              
              {uploadState === "encrypting" && (
                <div className="flex flex-col items-center justify-center gap-3 text-center">
                  <svg className="h-6 w-6 animate-pulse text-[#E41613]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-micro font-bold tracking-[0.2em] text-[#E41613]">
                    ENCRYPTING LOCALLY...
                  </span>
                </div>
              )}

              {uploadState === "uploading" && (
                 <div className="flex flex-col items-center justify-center gap-3 text-center">
                   <svg
                     className="h-6 w-6 animate-spin text-[#E41613]"
                     fill="none"
                     viewBox="0 0 24 24"
                   >
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   <span className="text-micro font-bold tracking-[0.2em] text-[#E41613]">
                     UPLOADING CIPHERTEXT...
                   </span>
                 </div>
              )}

              {uploadState === "complete" && (
                 <div className="flex flex-col items-center justify-center gap-3 text-center text-green-500">
                   <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                   </svg>
                   <span className="text-micro font-bold tracking-[0.2em]">
                     SEALED & VERIFIED
                   </span>
                 </div>
              )}

              {uploadState === "idle" && (
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
                
                {/* Tag Filter Dropdown */}
                {!isSandbox && allTags.length > 0 && (
                  <div className="relative shrink-0">
                    <select 
                      className="input-tactical py-2.5 px-4 text-xs font-semibold appearance-none bg-[#15161A] text-white/70 pr-8 border border-white/10"
                      value={selectedTagFilter || ""}
                      onChange={(e) => setSelectedTagFilter(e.target.value || null)}
                    >
                      <option value="">All Tags</option>
                      {allTags.map(t => (
                        <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                )}
              </div>

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
                      {/* Render Files */}
                      {displayedDocs.map((doc) => (
                        <tr key={doc.id} className="group border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.01] transition-colors sm:table-row">
                          <td 
                            data-label="Name" 
                            className="py-4 pr-4 text-sm text-white/95 cursor-pointer"
                            onClick={() => setSelectedDoc(doc)}
                          >
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
                              <div className="flex flex-col gap-1">
                                <span className="min-w-0 break-all sm:truncate sm:max-w-md font-medium">
                                  <ScrambledText text={doc.name} delay={20} />
                                </span>
                                {!isSandbox && docTagsCache[doc.id]?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {docTagsCache[doc.id].map((t: TagMetadata) => (
                                      <TagBadge key={t.id} tag={t} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td data-label="Size" className="py-4 pr-4 text-xs text-white/40 font-mono">
                            {formatSize(doc.size)}
                          </td>
                          <td data-label="Seal Date" className="py-4 pr-4 text-xs text-white/40">
                            {formatDate(doc.created_at)}
                          </td>
                          <td data-label="Actions" className="py-4 text-right">
                            <div className="flex flex-wrap justify-start gap-4 sm:justify-end items-center">
                              <button
                                onClick={(e) => {
                                   e.stopPropagation();
                                   handlePreview(doc);
                                }}
                                className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-white decoration-2 transition-all cursor-pointer"
                              >
                                Preview
                              </button>
                              <button
                                onClick={(e) => {
                                   e.stopPropagation();
                                   handleDownload(doc);
                                }}
                                className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer"
                              >
                                Download
                              </button>
                              <button
                                onClick={(e) => {
                                   e.stopPropagation();
                                   handleDelete(doc.id);
                                }}
                                className="btn-delete-tactical relative cursor-pointer"
                              >
                                <span className="btn-bg" />
                                <span className="btn-text">Delete</span>
                              </button>
                              <button
                                onClick={(e) => {
                                   e.stopPropagation();
                                   setShareDoc(doc);
                                }}
                                className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-[#E41613] hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Share2 size={12} />
                                Share
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
        ) : (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <SharedLinksPanel user={user} />
          </main>
        )}
      </div>

      {/* File Details Slide-out Panel */}
      <FileDetailsPanel 
        doc={selectedDoc} 
        isOpen={selectedDoc !== null} 
        onClose={() => {
           setSelectedDoc(null);
           if (user) {
             apiListTags(user.sessionToken).then(setAllTags).catch(()=>{});
           }
        }} 
        user={user}
        allTags={allTags}
        onTagAdded={(docId, newTags) => {
           setDocTagsCache(prev => ({...prev, [docId]: newTags}));
        }}
        onShare={(doc) => {
           setSelectedDoc(null);
           setShareDoc(doc);
        }}
      />
      
      {/* File Preview Modal */}
      <FilePreviewModal 
        isOpen={previewDoc !== null}
        onClose={() => {
           setPreviewDoc(null);
           setPreviewBytes(null);
        }}
        fileName={previewDoc?.name || ""}
        fileBytes={previewBytes}
      />

      {/* Share Modal */}
      <ShareModal
        doc={shareDoc}
        isOpen={shareDoc !== null}
        onClose={() => setShareDoc(null)}
        user={user}
        privateKey={privateKey}
      />
    </div>
  );
}
