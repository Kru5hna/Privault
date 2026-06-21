"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  apiDeleteFolderDocuments,
  apiCreateTag,
  apiTagDocument,
  apiGetFolderStats,
  DocumentMetadata,
  FolderMetadata,
  TagMetadata,
} from "@/lib/api";
import { encryptFile, decryptFile, getPublicKeyFromPrivateKey } from "@/lib/crypto";
import { encryptFileInWorker, decryptFileInWorker } from "@/lib/crypto-worker";
import { useDebounce } from "@/lib/use-debounce";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { UploadZone } from "@/components/dashboard/upload-zone";
import { DocumentsTable } from "@/components/dashboard/documents-table";
import { BatchUploadPanel } from "@/components/dashboard/batch-upload-panel";
import { FolderSidebar } from "@/components/folder-sidebar";
import { FileDetailsPanel } from "@/components/file-details-panel";
import { FilePreviewModal } from "@/components/file-preview-modal";
import { ShareModal } from "@/components/share-modal";
import { SharedLinksPanel } from "@/components/shared-links-panel";
import { TrashPanel } from "@/components/trash-panel";
import { ActivityLogPanel } from "@/components/activity-log-panel";
import { RecoveryPhraseModal } from "@/components/recovery-phrase-modal";
import { logActivity } from "@/lib/activity";
import { Menu, X, AlertTriangle, Settings } from "lucide-react";
import { toast } from "sonner";

interface SandboxDocument extends DocumentMetadata {
  ciphertext?: Uint8Array;
}

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

  // ── Data state ──
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [allFolders, setAllFolders] = useState<FolderMetadata[]>([]);
  const [allTags, setAllTags] = useState<TagMetadata[]>([]);
  const [docTagsCache, setDocTagsCache] = useState<Record<string, TagMetadata[]>>({});
  const [trashTagId, setTrashTagId] = useState<string | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // ── UI state ──
  const [viewMode, setViewMode] = useState<"vault" | "shares" | "trash" | "activity">("vault");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<DocumentMetadata | null>(null);
  const [shareDoc, setShareDoc] = useState<DocumentMetadata | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string | null, name: string}[]>([{id: null, name: "Root"}]);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isDragActive, setIsDragActive] = useState(false);
  // ── Preview state ──
  const [previewDoc, setPreviewDoc] = useState<{name: string} | null>(null);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);

  // ── Upload state ──
  const [uploadState, setUploadState] = useState<"idle" | "encrypting" | "uploading" | "complete">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batchUploads, setBatchUploads] = useState<Record<string, { name: string; size: number; state: "encrypting" | "uploading" | "complete" | "failed"; error?: string }>>({});
  const [panelMinimized, setPanelMinimized] = useState(false);

  // ── Modal state ──
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [duplicateFilePrompt, setDuplicateFilePrompt] = useState<{
    fileName: string;
    existingId: string;
    onResolve: (action: "overwrite" | "keep-both" | "skip") => void;
  } | null>(null);

  // ── Sandbox state ──
  const [demoDocs, setDemoDocs] = useState<SandboxDocument[]>([]);
  const [isSandbox, setIsSandbox] = useState(false);

  // ── Use Web Worker for encryption? (set false to fall back to main thread) ──
  const useWorker = typeof Worker !== "undefined" && typeof crypto.subtle?.exportKey === "function";

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      logout();
    }
  }, [user, authLoading, logout]);

  // ── Data Loading ──
  const loadData = useCallback(async () => {
    if (!user || !privateKey) return;
    setLoadingDocs(true);
    try {
      const [docs, fldrs, tags] = await Promise.all([
        apiListDocuments(user.sessionToken, currentFolderId),
        apiListAllFolders(user.sessionToken),
        apiListTags(user.sessionToken),
      ]);
      setDocuments(docs);
      setAllFolders(fldrs);
      setAllTags(tags);
      setIsSandbox(false);

      let trashTag = tags.find((t) => t.name.toLowerCase() === "trash");
      if (!trashTag) {
        try {
          trashTag = await apiCreateTag(user.sessionToken, "TRASH", "#E41613");
          tags.push(trashTag);
          setAllTags([...tags]);
        } catch {}
      }
      if (trashTag) setTrashTagId(trashTag.id);

      const docTagsObj: Record<string, TagMetadata[]> = {};
      await Promise.all(
        docs.map(async (d) => {
          try {
            docTagsObj[d.id] = await apiListDocumentTags(user.sessionToken, d.id);
          } catch {
            docTagsObj[d.id] = [];
          }
        })
      );
      setDocTagsCache(docTagsObj);
    } catch (err) {
      console.warn("Backend failed, falling back to sandbox", err);
      setIsSandbox(true);
      if (currentFolderId === null) {
        try {
          const pubKey = await getPublicKeyFromPrivateKey(privateKey);
          const preparedDemos = await Promise.all(
            DEMO_DOCUMENTS.map(async (doc) => {
              const { ciphertext, encryptedDek } = await encryptFile(
                new TextEncoder().encode(doc.content),
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
                ciphertext,
              };
            })
          );
          setDemoDocs(preparedDemos);
        } catch (cryptoErr) {
          console.error("Failed to prepare sandbox", cryptoErr);
        }
      } else {
        setDemoDocs([]);
      }
    } finally {
      setLoadingDocs(false);
    }
  }, [user, privateKey, currentFolderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const showRecovery = sessionStorage.getItem("privault_show_recovery");
      const mnemonic = sessionStorage.getItem("privault_mnemonic_temp");
      if (showRecovery === "true" && mnemonic) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRecoveryMnemonic(mnemonic);
        setShowRecoveryModal(true);
        sessionStorage.removeItem("privault_show_recovery");
        sessionStorage.removeItem("privault_mnemonic_temp");
      }
    }
  }, []);

  // ── Memoized Handlers (declared before guard to satisfy hooks rule) ──
  const handleFolderClick = useCallback((folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath((prev) => [...prev, { id: folderId, name: folderName }]);
    setSearchQuery("");
  }, []);

  const handleLogout = useCallback(() => {
    toast.error("Sign out of Privault?", {
      description: "Your encrypted key material will be cleared from memory.",
      duration: 10000,
      action: { label: "Sign Out", onClick: logout },
      cancel: { label: "Stay", onClick: () => {} },
    });
  }, [logout]);

  // ── Derived Data ──
  const displayedDocs = useMemo(
    () =>
      (isSandbox ? demoDocs : documents).filter((doc) => {
        const isTrashed = docTagsCache[doc.id]?.some((t) => t.name.toLowerCase() === "trash");
        if (isTrashed) return false;
        const matchesSearch = doc.name.toLowerCase().includes(debouncedSearch.toLowerCase());
        if (selectedTagFilter) {
          return matchesSearch && docTagsCache[doc.id]?.some((t) => t.id === selectedTagFilter);
        }
        return matchesSearch;
      }),
    [isSandbox, demoDocs, documents, docTagsCache, debouncedSearch, selectedTagFilter]
  );

  const displayedFolders = useMemo(
    () =>
      allFolders.filter((fld) => {
        if (fld.parent_id !== currentFolderId) return false;
        return fld.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      }),
    [allFolders, currentFolderId, debouncedSearch]
  );

  // ── Loading guard ──
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

  // ── Helper Functions ──

  const getOrCreateFoldersInPath = async (relativePath: string, rootFolderId: string | null): Promise<string | null> => {
    const parts = relativePath.split("/");
    const dirParts = parts.slice(0, parts.length - 1);
    let currentParentId = rootFolderId;
    for (const dirName of dirParts) {
      if (!dirName) continue;
      const existing = allFolders.find((f) => f.name === dirName && f.parent_id === currentParentId);
      if (existing) {
        currentParentId = existing.id;
      } else {
        if (isSandbox) {
          const newFolder: FolderMetadata = {
            id: `sandbox-folder-${Date.now()}-${Math.random()}`,
            owner_id: user?.userId || "demo-user",
            parent_id: currentParentId,
            name: dirName,
            created_at: new Date().toISOString(),
          };
          allFolders.push(newFolder);
          setAllFolders([...allFolders]);
          currentParentId = newFolder.id;
        } else {
          try {
            const folder = await apiCreateFolder(user.sessionToken, dirName, currentParentId);
            allFolders.push(folder);
            setAllFolders([...allFolders]);
            currentParentId = folder.id;
          } catch (err) {
            throw err;
          }
        }
      }
    }
    return currentParentId;
  };

  const resolveDuplicate = (fileName: string, existingId: string): Promise<"overwrite" | "keep-both" | "skip"> => {
    return new Promise((resolve) => {
      setDuplicateFilePrompt({
        fileName,
        existingId,
        onResolve: (action) => {
          setDuplicateFilePrompt(null);
          resolve(action);
        },
      });
    });
  };

  // ── Upload Logic ──

  const handleUploadQueue = async (uploadQueue: { file: File; relativePath: string }[]) => {
    if (!user || !privateKey) return;
    setUploadError(null);
    setPanelMinimized(false);

    const initialUploads: Record<string, { name: string; size: number; state: "encrypting" | "uploading" | "complete" | "failed"; error?: string }> = {};
    uploadQueue.forEach((item) => {
      initialUploads[item.relativePath] = {
        name: item.file.name,
        size: item.file.size,
        state: "encrypting" as const,
      };
    });
    setBatchUploads(initialUploads);
    setUploadState("encrypting");

    try {
      const rsaPublicKey = await getPublicKeyFromPrivateKey(privateKey);

      const uploadWorker = async (item: { file: File; relativePath: string }) => {
        const { file, relativePath } = item;
        try {
          const targetFolderId = await getOrCreateFoldersInPath(relativePath, currentFolderId);
          const existingDocs = isSandbox ? demoDocs : documents;
          const duplicate = existingDocs.find((d) => d.name === file.name && d.folder_id === targetFolderId);
          let uploadName = file.name;
          let shouldOverwrite = false;

          if (duplicate) {
            const resolution = await resolveDuplicate(file.name, duplicate.id);
            if (resolution === "skip") {
              setBatchUploads((prev) => {
                const next = { ...prev };
                delete next[relativePath];
                return next;
              });
              return;
            } else if (resolution === "keep-both") {
              const extIdx = file.name.lastIndexOf(".");
              const base = extIdx === -1 ? file.name : file.name.slice(0, extIdx);
              const ext = extIdx === -1 ? "" : file.name.slice(extIdx);
              uploadName = `${base} (${Date.now().toString().slice(-4)})${ext}`;
            } else if (resolution === "overwrite") {
              shouldOverwrite = true;
            }
          }

          const fileBytes = new Uint8Array(await file.arrayBuffer());
          let ciphertext: Uint8Array;
          let encryptedDek: string;

          // Use Web Worker if available, otherwise fall back to main thread
          if (useWorker) {
            const result = await encryptFileInWorker(fileBytes, rsaPublicKey);
            ciphertext = result.ciphertext;
            encryptedDek = result.encryptedDek;
          } else {
            const result = await encryptFile(fileBytes, rsaPublicKey);
            ciphertext = result.ciphertext;
            encryptedDek = result.encryptedDek;
          }

          setBatchUploads((prev) => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], name: uploadName, state: "uploading" as const },
          }));

          if (isSandbox) {
            if (shouldOverwrite && duplicate) {
              setDemoDocs((prev) => prev.filter((d) => d.id !== duplicate.id));
            }
            const newDoc: SandboxDocument = {
              id: `sandbox-doc-${Date.now()}-${Math.random()}`,
              owner_id: user.userId,
              name: uploadName,
              size: file.size,
              folder_id: targetFolderId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              encrypted_dek: encryptedDek,
              ciphertext,
            };
            setDemoDocs((prev) => [newDoc, ...prev]);
          } else {
            if (shouldOverwrite && duplicate) {
              await apiDeleteDocument(user.sessionToken, duplicate.id);
            }
            const blob = new Blob([ciphertext as unknown as BlobPart], { type: "application/octet-stream" });
            await apiUploadDocument(user.sessionToken, blob, uploadName, encryptedDek, targetFolderId);
          }

          setBatchUploads((prev) => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "complete" as const },
          }));
          logActivity(user.userId, "Upload", `Uploaded encrypted file: ${uploadName}`);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : "Upload failed";
          setBatchUploads((prev) => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "failed" as const, error: errorMsg },
          }));
        }
      };

      for (const item of uploadQueue) {
        await uploadWorker(item).catch((err) => console.error("Upload failure", err));
      }

      setUploadState("complete");
      setTimeout(() => setUploadState("idle"), 2000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to process batch upload";
      setUploadError(errorMsg);
      setUploadState("idle");
    } finally {
      if (!isSandbox) {
        try {
          const docs = await apiListDocuments(user.sessionToken, currentFolderId);
          setDocuments(docs);
        } catch {}
      }
    }
  };

  const handleMultipleFilesUpload = async (files: FileList | File[]) => {
    const queue = Array.from(files).map((file) => ({ file, relativePath: file.name }));
    await handleUploadQueue(queue);
  };

  const onFolderSelectChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const queue = Array.from(e.target.files).map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name,
      }));
      await handleUploadQueue(queue);
    }
  };

  // ── CRUD Handlers ──

  const handleCreateFolderSidebar = async (name: string, parentId: string | null) => {
    if (!user) return;
    try {
      if (isSandbox) { toast.error("Folders not supported in sandbox mode."); return; }
      await apiCreateFolder(user.sessionToken, name, parentId);
      setAllFolders(await apiListAllFolders(user.sessionToken));
      toast.success("Folder created successfully");
    } catch (err: unknown) {
      toast.error(`Failed to create folder: ${err instanceof Error ? err.message : "Unknown"}`);
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
      setAllFolders(await apiListAllFolders(user.sessionToken));
      toast.success("Folder deleted securely");
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleRenameFolderSidebar = async (folderId: string, newName: string) => {
    if (!user) return;
    try {
      await apiRenameFolder(user.sessionToken, folderId, newName);
      setAllFolders(await apiListAllFolders(user.sessionToken));
      toast.success("Folder renamed");
    } catch (err: unknown) {
      toast.error(`Rename failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleDeleteFolder = async (folder: FolderMetadata) => {
    if (!user) return;
    try {
      const stats = await apiGetFolderStats(folder.id, user.sessionToken);
      toast.error(`Delete folder "${folder.name}"?`, {
        description: `This will permanently delete:\n• ${stats.file_count} files\n• ${stats.subfolder_count} subfolders`,
        duration: 10000,
        action: { label: "Delete", onClick: () => handleDeleteFolderSidebar(folder.id) },
        cancel: { label: "Cancel", onClick: () => {} },
      });
    } catch {
      toast.error(`Delete folder "${folder.name}"?`, {
        description: "Are you sure?",
        duration: 10000,
        action: { label: "Delete", onClick: () => handleDeleteFolderSidebar(folder.id) },
        cancel: { label: "Cancel", onClick: () => {} },
      });
    }
  };

  const handleDownload = async (doc: SandboxDocument) => {
    if (!user || !privateKey) return;
    try {
      const ciphertext = isSandbox ? (doc.ciphertext || new Uint8Array()) : await apiDownloadDocument(user.sessionToken, doc.id);
      const decryptedBytes = useWorker
        ? await decryptFileInWorker(ciphertext, doc.encrypted_dek, privateKey)
        : await decryptFile(ciphertext, doc.encrypted_dek, privateKey);
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
      toast.error(`Decryption failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handlePreview = async (doc: SandboxDocument) => {
    if (!user || !privateKey) return;
    setPreviewDoc({ name: doc.name });
    setPreviewBytes(null);
    try {
      const ciphertext = isSandbox ? (doc.ciphertext || new Uint8Array()) : await apiDownloadDocument(user.sessionToken, doc.id);
      const decryptedBytes = useWorker
        ? await decryptFileInWorker(ciphertext, doc.encrypted_dek, privateKey)
        : await decryptFile(ciphertext, doc.encrypted_dek, privateKey);
      setPreviewBytes(decryptedBytes);
    } catch (err: unknown) {
      toast.error(`Preview failed: ${err instanceof Error ? err.message : "Unknown"}`);
      setPreviewDoc(null);
    }
  };

  const handleDeleteAllFiles = () => {
    if (!user) return;
    const count = documents.length;
    if (count === 0) return;
    toast.error(`Delete ${count} files from this folder?`, {
      description: "This action cannot be undone.",
      duration: 10000,
      action: {
        label: "Delete All",
        onClick: async () => {
          setLoadingDocs(true);
          try {
            if (isSandbox) {
              setDemoDocs((prev) => prev.filter((d) => d.folder_id !== currentFolderId));
              toast.success(`Deleted ${count} files`);
            } else {
              if (currentFolderId === null) {
                await Promise.all(documents.map((d) => apiDeleteDocument(user.sessionToken, d.id)));
              } else {
                await apiDeleteFolderDocuments(user.sessionToken, currentFolderId);
              }
              setDocuments(await apiListDocuments(user.sessionToken, currentFolderId));
              toast.success(`Deleted ${count} files`);
            }
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete all files");
          } finally {
            setLoadingDocs(false);
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const handleDelete = (id: string) => {
    if (!user) return;
    toast.error("Move document to Recycle Bin?", {
      icon: null,
      action: {
        label: "Move to Trash",
        onClick: async () => {
          setLoadingDocs(true);
          try {
            const docName = (isSandbox ? demoDocs : documents).find((d) => d.id === id)?.name || "Unknown";
            if (isSandbox) {
              const trashTag: TagMetadata = {
                id: "sandbox-trash-tag",
                owner_id: user.userId,
                name: "TRASH",
                color: "#E41613",
                created_at: new Date().toISOString(),
              };
              setDocTagsCache((prev) => ({ ...prev, [id]: [...(prev[id] || []), trashTag] }));
              toast.success("Document moved to Recycle Bin (Sandbox)");
            } else {
              if (!trashTagId) { toast.error("Recycle bin not initialized"); return; }
              await apiTagDocument(user.sessionToken, id, trashTagId);
              const freshDocs = await apiListDocuments(user.sessionToken, currentFolderId);
              setDocuments(freshDocs);
              try {
                const tags = await apiListDocumentTags(user.sessionToken, id);
                setDocTagsCache((prev) => ({ ...prev, [id]: tags }));
              } catch {}
              toast.success("Document moved to Recycle Bin");
            }
            logActivity(user.userId, "Delete", `Moved document to Recycle Bin: ${docName}`);
          } catch (err: unknown) {
            toast.error(`Failed to delete: ${err instanceof Error ? err.message : "Unknown"}`);
          } finally {
            setLoadingDocs(false);
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 10000,
    });
  };

  // ── Drag & Drop ──

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragActive(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleBreadcrumbClick = (crumb: { id: string | null; name: string }, idx: number) => {
    setCurrentFolderId(crumb.id);
    setFolderPath(folderPath.slice(0, idx + 1));
    setSearchQuery("");
  };

  return (
    <div className="flex min-h-screen bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative overflow-x-hidden w-full">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

      {/* Sidebar Toggler */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-[18px] left-[18px] z-50 p-1.5 text-[#8E929F] hover:text-white rounded hover:bg-white/5 cursor-pointer transition-all duration-300"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

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
        sessionToken={user?.sessionToken}
      />

      <div className={`flex-1 flex flex-col min-w-0 min-h-screen transition-[padding] duration-300 ${sidebarOpen ? "md:pl-64" : "md:pl-0"}`}>
        <DashboardHeader
          sidebarOpen={sidebarOpen}
          user={user}
          onOpenSettings={() => setShowSettingsModal(true)}
          onLogout={handleLogout}
        />

        {viewMode === "vault" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="font-serif text-2xl font-light tracking-wide text-white sm:text-3xl">
                  Document Vault
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-medium tracking-wider text-white/50">
                  <div className="flex flex-wrap items-center gap-2">
                    {folderPath.map((crumb, idx) => (
                      <React.Fragment key={crumb.id || "root"}>
                        {idx > 0 && <span className="text-white/20 select-none">/</span>}
                        <button
                          onClick={() => handleBreadcrumbClick(crumb, idx)}
                          className={`transition-all cursor-pointer underline-offset-4 decoration-1 ${
                            idx === folderPath.length - 1
                              ? "text-white"
                              : "text-white/40 hover:text-[#E41613] hover:underline decoration-[#E41613]"
                          }`}
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                  {documents.length > 0 && (
                    <button
                      onClick={handleDeleteAllFiles}
                      className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-white hover:bg-red-600/10 border border-red-500/20 hover:border-red-500 px-3 py-1 transition-all cursor-pointer rounded"
                    >
                      Delete All Files
                    </button>
                  )}
                </div>
              </div>
              {isSandbox && (
                <div className="inline-flex max-w-full items-center gap-2 border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span className="font-semibold uppercase tracking-wider">In-Memory Sandbox Mode</span>
                </div>
              )}
            </div>

            <UploadZone
              uploadState={uploadState}
              uploadError={uploadError}
              isDragActive={isDragActive}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onFilesSelected={(files) => handleMultipleFilesUpload(files)}
              onFolderSelect={onFolderSelectChange}
            />

            <section className="panel-card p-4 sm:p-8">
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
                {!isSandbox && allTags.length > 0 && (
                  <div className="relative shrink-0">
                    <select
                      className="input-tactical py-2.5 px-4 text-xs font-semibold appearance-none bg-[#15161A] text-white/70 pr-8 border border-white/10"
                      value={selectedTagFilter || ""}
                      onChange={(e) => setSelectedTagFilter(e.target.value || null)}
                    >
                      <option value="">All Tags</option>
                      {allTags.map((t) => (
                        <option key={t.id} value={t.id}>{t.name.toUpperCase()}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              <DocumentsTable
                displayedDocs={displayedDocs}
                displayedFolders={displayedFolders}
                documents={documents}
                folders={allFolders}
                docTagsCache={docTagsCache}
                isSandbox={isSandbox}
                loading={loadingDocs}
                onFolderClick={handleFolderClick}
                onDocumentSelect={setSelectedDoc}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onShare={setShareDoc}
                onDelete={handleDelete}
                onDeleteFolder={handleDeleteFolder}
              />
            </section>
          </main>
        )}

        {viewMode === "shares" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <SharedLinksPanel user={user} />
          </main>
        )}

        {viewMode === "trash" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <TrashPanel
              user={user}
              documents={isSandbox ? demoDocs : documents}
              docTagsCache={docTagsCache}
              isSandbox={isSandbox}
              onRefresh={loadData}
              trashTagId={trashTagId}
              setDemoDocs={setDemoDocs}
            />
          </main>
        )}

        {viewMode === "activity" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <ActivityLogPanel userId={user.userId} />
          </main>
        )}
      </div>

      <FileDetailsPanel
        doc={selectedDoc}
        isOpen={selectedDoc !== null}
        onClose={() => {
          setSelectedDoc(null);
          if (user) apiListTags(user.sessionToken).then(setAllTags).catch(() => {});
        }}
        user={user}
        allTags={allTags}
        onTagAdded={(docId, newTags) => setDocTagsCache((prev) => ({ ...prev, [docId]: newTags }))}
        onShare={(doc) => { setSelectedDoc(null); setShareDoc(doc); }}
      />

      <FilePreviewModal
        isOpen={previewDoc !== null}
        onClose={() => { setPreviewDoc(null); setPreviewBytes(null); }}
        fileName={previewDoc?.name || ""}
        fileBytes={previewBytes}
      />

      <ShareModal
        doc={shareDoc}
        isOpen={shareDoc !== null}
        onClose={() => setShareDoc(null)}
        user={user}
        privateKey={privateKey}
      />

      {Object.keys(batchUploads).length > 0 && (
        <BatchUploadPanel
          uploads={batchUploads}
          minimized={panelMinimized}
          onToggleMinimize={() => setPanelMinimized((prev) => !prev)}
          onDismiss={() => setBatchUploads({})}
        />
      )}

      <RecoveryPhraseModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        mnemonic={recoveryMnemonic}
        username={user?.username || ""}
      />

      {/* Duplicate Resolution Modal */}
      {duplicateFilePrompt && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/85 backdrop-blur-xs px-4">
          <div className="w-full max-w-md bg-[#111215] border border-white/10 p-6 sm:p-8 rounded text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-serif text-base font-bold text-white mb-2 uppercase tracking-wide">
              Duplicate File Detected
            </h3>
            <p className="text-xs text-[#8E929F] mb-6 leading-relaxed">
              A document named <span className="text-white font-mono">&ldquo;{duplicateFilePrompt.fileName}&rdquo;</span> already exists.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => duplicateFilePrompt.onResolve("keep-both")}
                className="w-full py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors hover:bg-white/10 cursor-pointer">
                Keep Both (Rename copy)
              </button>
              <button onClick={() => duplicateFilePrompt.onResolve("overwrite")}
                className="w-full py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors hover:bg-[#c31310] cursor-pointer">
                Overwrite Existing File
              </button>
              <button onClick={() => duplicateFilePrompt.onResolve("skip")}
                className="w-full py-2.5 bg-transparent text-white/50 text-xs font-bold uppercase tracking-wider rounded transition-colors hover:text-white cursor-pointer">
                Skip File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className="w-full h-auto max-w-xl bg-[#111215] border border-white/10 p-6 sm:p-8 rounded relative shadow-2xl font-sans">
            <button onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors cursor-pointer">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
              <Settings size={20} className="text-[#E41613]" />
              <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">Account Settings</h2>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                  <span className="h-3 w-1 bg-[#E41613]" />Secure Identity
                </h4>
                <div className="grid grid-cols-3 gap-2 text-xs border border-white/5 p-4 bg-[#15161A]/40">
                  <span className="text-white/40">Username</span>
                  <span className="col-span-2 text-white font-mono font-medium">{user?.username}</span>
                  <span className="text-white/40">User UUID</span>
                  <span className="col-span-2 text-white font-mono break-all text-[11px]">{user?.userId}</span>
                  <span className="text-white/40">Encryption</span>
                  <span className="col-span-2 text-green-400 font-semibold uppercase text-[10px]">RSA-2048 + AES-256-GCM</span>
                </div>
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                  <span className="h-3 w-1 bg-[#E41613]" />Security Actions
                </h4>
                <div className="divide-y divide-white/5 border border-white/5">
                  <button onClick={() => { setShowSettingsModal(false); setShowRecoveryModal(true); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs text-left hover:bg-[#1E2026] transition-colors cursor-pointer group">
                    <span className="text-white/70 group-hover:text-white">View Recovery Phrase</span>
                    <span className="text-[10px] text-[#8E929F] group-hover:text-[#E41613]">&rarr;</span>
                  </button>
                  <div className="flex items-center justify-between px-4 py-3 text-xs opacity-50 cursor-not-allowed">
                    <span className="text-white/50">Change Master Password</span>
                    <span className="text-[9px] text-amber-500 uppercase tracking-wider">Phase 2</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-xs opacity-50 cursor-not-allowed">
                    <span className="text-white/50">Session Management</span>
                    <span className="text-[9px] text-amber-500 uppercase tracking-wider">Phase 2</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-xs opacity-50 cursor-not-allowed">
                    <span className="text-white/50">Delete Account</span>
                    <span className="text-[9px] text-amber-500 uppercase tracking-wider">Phase 2</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-[#8E929F] uppercase tracking-widest">RSA Public Key (SPKI)</h4>
                <div className="bg-black/40 border border-white/5 p-3 rounded-sm font-mono text-[9px] text-white/50 break-all select-all leading-normal max-h-16 overflow-y-auto custom-scrollbar">
                  {user?.publicKey}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 border-t border-white/5 pt-4">
              <button onClick={() => setShowSettingsModal(false)}
                className="py-2 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-white/10 cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
