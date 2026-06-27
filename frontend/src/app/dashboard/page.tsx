"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  apiChangePassword,
  apiDeleteAccount,
  apiGetUsage,
  UsageInfo,
  DocumentMetadata,
  FolderMetadata,
  TagMetadata,
} from "@/lib/api";
import { encryptFile, decryptFile, getPublicKeyFromPrivateKey, deriveAuthVerifier, deriveKEK, generateSalt, wrapPrivateKey } from "@/lib/crypto";
import { encryptFileInWorker, decryptFileInWorker } from "@/lib/crypto-worker";
import { useDebounce } from "@/lib/use-debounce";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { VerifyEmailBanner } from "@/components/dashboard/verify-email-banner";
import { SettingsModal } from "@/components/settings-modal";
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
import { ChangePasswordModal } from "@/components/change-password-modal";
import { DeleteConfirmModal } from "@/components/delete-confirm-modal";
import { SessionManagementModal } from "@/components/session-management-modal";
import { Modal } from "@/components/ui/modal";
import { logActivity } from "@/lib/activity";
import { Menu, X, AlertTriangle, UploadCloud } from "lucide-react";
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

  // ── Storage usage state (for sidebar meter) ──
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

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
  const [previewDoc, setPreviewDoc] = useState<SandboxDocument | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);

  // ── Upload state ──
  const [uploadState, setUploadState] = useState<"idle" | "encrypting" | "uploading" | "complete">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batchUploads, setBatchUploads] = useState<Record<string, { name: string; size: number; state: "encrypting" | "uploading" | "complete" | "failed"; error?: string }>>({});
  const [panelMinimized, setPanelMinimized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dragCounter = useRef(0);

  const handleCancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadState("idle");
    setUploadError(null);
    setBatchUploads({});
  }, []);

  // ── Modal state ──
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [duplicateFilePrompt, setDuplicateFilePrompt] = useState<{
    fileName: string;
    existingId: string;
    onResolve: (action: "overwrite" | "keep-both" | "skip") => void;
  } | null>(null);
  const [oversizedFiles, setOversizedFiles] = useState<{ name: string; size: number }[]>([]);
  const [showSizeLimitModal, setShowSizeLimitModal] = useState(false);

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

  // ── Storage usage (sidebar meter) ──
  const refreshUsage = useCallback(async () => {
    if (!user) return;
    setUsageLoading(true);
    try {
      const info = await apiGetUsage(user.sessionToken);
      setUsage(info);
    } catch (err) {
      console.warn("Failed to fetch usage", err);
    } finally {
      setUsageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshUsage();
  }, [refreshUsage]);

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

  // ── Change Password ──
  const handleChangePassword = useCallback(async (
    currentPassword: string,
    newPassword: string,
  ) => {
    if (!user || !privateKey) return;
    setChangePasswordLoading(true);
    try {
      const newAuthSalt = generateSalt();
      const newKekSalt = generateSalt();

      const currentAuthVerifier = await deriveAuthVerifier(currentPassword, user.authSalt);
      const newAuthVerifier = await deriveAuthVerifier(newPassword, newAuthSalt);
      const newKEK = await deriveKEK(newPassword, newKekSalt);

      const { wrappedKey, iv } = await wrapPrivateKey(privateKey, newKEK);

      await apiChangePassword(
        user.sessionToken,
        currentAuthVerifier,
        newAuthVerifier,
        newAuthSalt,
        newKekSalt,
        wrappedKey,
        iv,
      );

      const updatedSession = {
        ...user,
        kekSalt: newKekSalt,
        wrappedPrivateKey: wrappedKey,
        wrappedPrivateKeyIv: iv,
      };
      localStorage.setItem("privault_session", JSON.stringify(updatedSession));

      toast.success("Master password changed successfully");
      setShowChangePasswordModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      toast.error(msg);
    } finally {
      setChangePasswordLoading(false);
    }
  }, [user, privateKey]);

  // ── Delete Account ──
  const handleDeleteAccount = useCallback(async () => {
    if (!user) return;
    setDeleteAccountLoading(true);
    try {
      await apiDeleteAccount(user.sessionToken);
      toast.success("Account deleted permanently");
      setShowDeleteConfirmModal(false);
      logout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete account";
      toast.error(msg);
      setDeleteAccountLoading(false);
    }
  }, [user, logout]);

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

  // ── Preview navigation handlers ──
  const handlePreview = useCallback(async (doc: SandboxDocument) => {
    if (!user || !privateKey) return;
    const idx = displayedDocs.findIndex((d) => d.id === doc.id);
    setPreviewIndex(idx);
    setPreviewDoc(doc);
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
  }, [user, privateKey, displayedDocs, isSandbox, useWorker]);

  const handleNavigatePreview = useCallback((direction: "prev" | "next") => {
    if (!user || !privateKey || displayedDocs.length === 0) return;
    const newIndex = direction === "prev" ? previewIndex - 1 : previewIndex + 1;
    if (newIndex < 0 || newIndex >= displayedDocs.length) return;
    const doc = displayedDocs[newIndex];
    handlePreview(doc);
  }, [user, privateKey, displayedDocs, previewIndex, handlePreview]);

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

  const MAX_FILE_SIZE = 104_857_600; // 100 MB

  const filterOversizedFiles = (files: File[]): { valid: File[]; oversized: { name: string; size: number }[] } => {
    const oversized: { name: string; size: number }[] = [];
    const valid: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        oversized.push({ name: file.name, size: file.size });
      } else {
        valid.push(file);
      }
    }
    return { valid, oversized };
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUploadQueue = async (uploadQueue: { file: File; relativePath: string }[]) => {
    if (!user || !privateKey) return;
    setUploadError(null);
    setPanelMinimized(false);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

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
        if (signal.aborted) return;
        try {
          const targetFolderId = await getOrCreateFoldersInPath(relativePath, currentFolderId);
          if (signal.aborted) return;
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

          if (signal.aborted) return;

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

          if (signal.aborted) return;

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
            await apiUploadDocument(user.sessionToken, blob, uploadName, encryptedDek, targetFolderId, signal);
          }

          if (signal.aborted) return;

          setBatchUploads((prev) => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "complete" as const },
          }));
          logActivity(user.sessionToken, "Upload", `Uploaded encrypted file: ${uploadName}`);
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          const errorMsg = err instanceof Error ? err.message : "Upload failed";
          setBatchUploads((prev) => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "failed" as const, error: errorMsg },
          }));
        }
      };

      for (const item of uploadQueue) {
        if (signal.aborted) break;
        await uploadWorker(item).catch(() => {});
      }

      if (signal.aborted) {
        setUploadState("idle");
        setBatchUploads({});
        return;
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
      refreshUsage();
    }
  };

  const handleMultipleFilesUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const { valid, oversized } = filterOversizedFiles(fileArray);
    if (oversized.length > 0) {
      setOversizedFiles(oversized);
      setShowSizeLimitModal(true);
      if (valid.length === 0) return;
    }
    const queue = valid.map((file) => ({ file, relativePath: file.name }));
    await handleUploadQueue(queue);
  };

  const onFolderSelectChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files);
      const { valid, oversized } = filterOversizedFiles(fileArray);
      if (oversized.length > 0) {
        setOversizedFiles(oversized);
        setShowSizeLimitModal(true);
        if (valid.length === 0) return;
      }
      const queue = valid.map((file) => ({
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
      refreshUsage();
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
      logActivity(user.sessionToken, "Download", `Downloaded decrypted file: ${doc.name}`);
    } catch (err: unknown) {
      toast.error(`Decryption failed: ${err instanceof Error ? err.message : "Unknown"}`);
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
            refreshUsage();
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
            refreshUsage();
            logActivity(user.sessionToken, "Delete", `Moved document to Recycle Bin: ${docName}`);
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
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragActive(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
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
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="flex min-h-screen bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative overflow-x-hidden w-full"
    >
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

      {/* Fullscreen Drag Overlay */}
      {isDragActive && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0D0E10]/90 backdrop-blur-md border-[2px] border-dashed border-[#E41613] m-4 pointer-events-none">
          <div className="flex flex-col items-center gap-4 animate-bounce text-center p-6">
            <UploadCloud size={64} className="text-[#E41613] mb-2" />
            <p className="text-lg font-bold uppercase tracking-[0.2em] text-white">
              Drag & drop files or folders anywhere
            </p>
            <p className="text-xs text-[#8E929F] tracking-widest uppercase">
              Files are AES-256-GCM encrypted in your browser before leaving your machine
            </p>
          </div>
        </div>
      )}

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
        usage={usage}
        usageLoading={usageLoading}
      />

      <div className={`flex-1 flex flex-col min-w-0 min-h-screen transition-[padding] duration-300 ${sidebarOpen ? "md:pl-64" : "md:pl-0"}`}>
        <DashboardHeader
          sidebarOpen={sidebarOpen}
          user={user}
          onOpenSettings={() => setShowSettingsModal(true)}
          onLogout={handleLogout}
        />

        <VerifyEmailBanner />

        {viewMode === "vault" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div className="flex-1 w-full">
                <h1 className="font-serif text-2xl font-light tracking-wide text-white sm:text-3xl">
                  Document Vault
                </h1>
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm font-medium tracking-wider text-white/50 w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    {folderPath.map((crumb, idx) => (
                      <React.Fragment key={crumb.id || "root"}>
                        {idx > 0 && <span className="text-white/20 select-none">/</span>}
                        <button
                          onClick={() => handleBreadcrumbClick(crumb, idx)}
                          className={`transition-all cursor-pointer underline underline-offset-4 decoration-1 ${
                            idx === folderPath.length - 1
                              ? "text-white decoration-white/30"
                              : "text-white/40 hover:text-[#E41613] decoration-white/20 hover:decoration-[#E41613]"
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
                      className="btn-delete-tactical relative cursor-pointer"
                    >
                      <span className="btn-bg" />
                      <span className="btn-text">Delete All Files</span>
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
              onCancel={handleCancelUpload}
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
              onRefresh={async () => {
                await loadData();
                await refreshUsage();
              }}
              trashTagId={trashTagId}
              setDemoDocs={setDemoDocs}
            />
          </main>
        )}

        {viewMode === "activity" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <ActivityLogPanel sessionToken={user.sessionToken} />
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
        onClose={() => { setPreviewDoc(null); setPreviewBytes(null); setPreviewIndex(-1); }}
        fileName={previewDoc?.name || ""}
        fileBytes={previewBytes}
        onPrev={() => handleNavigatePreview("prev")}
        onNext={() => handleNavigatePreview("next")}
        hasPrev={previewIndex > 0}
        hasNext={previewIndex < displayedDocs.length - 1}
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
          onCancel={handleCancelUpload}
        />
      )}

      <RecoveryPhraseModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        onBack={() => { setShowRecoveryModal(false); setShowSettingsModal(true); }}
        mnemonic={recoveryMnemonic}
        username={user?.username || ""}
      />

      {/* File Size Limit Modal */}
      <Modal
        isOpen={showSizeLimitModal && oversizedFiles.length > 0}
        onClose={() => setShowSizeLimitModal(false)}
        size="md"
        zIndex={170}
        showCloseButton={false}
        data-testid="size-limit-modal"
      >
        <div className="w-full max-w-md bg-[#111215] border border-white/10 p-6 sm:p-8 rounded">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-serif text-base font-bold text-white mb-2 text-center uppercase tracking-wide">
            File{oversizedFiles.length > 1 ? "s" : ""} Exceed{oversizedFiles.length === 1 ? "s" : ""} Limit
          </h3>
          <p className="text-xs text-[#8E929F] mb-5 text-center leading-relaxed">
            The following file{oversizedFiles.length > 1 ? "s" : ""} exceed{oversizedFiles.length === 1 ? "s" : ""} the{" "}
            <span className="text-white font-semibold">100 MB</span> upload limit and cannot be uploaded.
          </p>
          <div className="space-y-2 mb-6 max-h-40 overflow-y-auto custom-scrollbar">
            {oversizedFiles.map((f) => (
              <div key={f.name} className="flex items-center justify-between bg-[#15161A] border border-white/5 px-3 py-2">
                <span className="text-xs text-white/80 truncate font-mono">{f.name}</span>
                <span className="text-[11px] text-[#E41613] font-semibold shrink-0 ml-3">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowSizeLimitModal(false)}
            className="w-full py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors hover:bg-[#c31310] cursor-pointer"
          >
            Got It
          </button>
        </div>
      </Modal>

      {/* Duplicate Resolution Modal */}
      <Modal
        isOpen={duplicateFilePrompt !== null}
        onClose={() => duplicateFilePrompt?.onResolve("skip")}
        size="md"
        zIndex={170}
        showCloseButton={false}
        data-testid="duplicate-file-modal"
      >
        {duplicateFilePrompt && (
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
        )}
      </Modal>

      {/* Account Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        user={user}
        onOpenRecoveryPhrase={() => {
          setShowSettingsModal(false);
          setShowRecoveryModal(true);
        }}
        onOpenChangePassword={() => {
          setShowSettingsModal(false);
          setShowChangePasswordModal(true);
        }}
        onOpenSessionManagement={() => {
          setShowSettingsModal(false);
          setShowSessionModal(true);
        }}
        onOpenDeleteAccount={() => {
          setShowSettingsModal(false);
          setShowDeleteConfirmModal(true);
        }}
      />

      {/* Session Management Modal */}
      <SessionManagementModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        sessionToken={user?.sessionToken || ""}
      />

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          onClose={() => setShowChangePasswordModal(false)}
          onSubmit={handleChangePassword}
          loading={changePasswordLoading}
        />
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirmModal && (
        <DeleteConfirmModal
          username={user?.username ?? ""}
          confirmText={deleteConfirmText}
          onConfirmTextChange={setDeleteConfirmText}
          onConfirm={handleDeleteAccount}
          onClose={() => { setShowDeleteConfirmModal(false); setDeleteConfirmText(""); }}
          loading={deleteAccountLoading}
        />
      )}
    </div>
  );
}
