"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
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
import { TrashPanel } from "@/components/trash-panel";
import { ActivityLogPanel } from "@/components/activity-log-panel";
import { RecoveryPhraseModal } from "@/components/recovery-phrase-modal";
import { logActivity } from "@/lib/activity";
import { Menu, Share2, X, Lock, CheckCircle2, AlertTriangle, ChevronUp, ChevronDown, Loader2, File, Settings, BookOpen } from "lucide-react";
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
  const [viewMode, setViewMode] = useState<"vault" | "shares" | "trash" | "activity">("vault");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

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
  const [batchUploads, setBatchUploads] = useState<Record<string, { name: string; size: number; state: "encrypting" | "uploading" | "complete" | "failed"; error?: string }>>({});
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryMnemonic, setRecoveryMnemonic] = useState("");
  const [trashTagId, setTrashTagId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const storageKey = `privault_notes_${user.userId}_${currentFolderId || "root"}`;
    const saved = localStorage.getItem(storageKey);
    setNotesText(saved || "");
  }, [currentFolderId, user]);

  const handleNotesChange = (text: string) => {
    if (!user) return;
    setNotesText(text);
    setNotesSaving(true);
    const storageKey = `privault_notes_${user.userId}_${currentFolderId || "root"}`;
    localStorage.setItem(storageKey, text);
    setTimeout(() => setNotesSaving(false), 300);
  };

  const [duplicateFilePrompt, setDuplicateFilePrompt] = useState<{
    fileName: string;
    existingId: string;
    onResolve: (action: "overwrite" | "keep-both" | "skip") => void;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      logout();
    }
  }, [user, authLoading, logout]);

  // Load documents and folders
  const loadData = useCallback(async () => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;

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

      // Check for / create the TRASH tag silently
      let trashTag = tags.find(t => t.name.toLowerCase() === "trash");
      if (!trashTag && !isSandbox) {
        try {
          trashTag = await apiCreateTag(currentUser.sessionToken, "TRASH", "#E41613");
          tags.push(trashTag);
          setAllTags([...tags]);
        } catch (e) {
          console.error("Failed to create default trash tag:", e);
        }
      }
      if (trashTag) {
        setTrashTagId(trashTag.id);
      }
      
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
  }, [user, privateKey, currentFolderId, isSandbox]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check for recovery phrase onboarding on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const showRecovery = sessionStorage.getItem("privault_show_recovery");
      const mnemonic = sessionStorage.getItem("privault_mnemonic_temp");
      if (showRecovery === "true" && mnemonic) {
        setRecoveryMnemonic(mnemonic);
        setShowRecoveryModal(true);
        sessionStorage.removeItem("privault_show_recovery");
        sessionStorage.removeItem("privault_mnemonic_temp");
      }
    }
  }, []);

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

  // Resolve/create folder path recursively and return the deepest folder ID
  const getOrCreateFoldersInPath = async (relativePath: string, rootFolderId: string | null): Promise<string | null> => {
    const parts = relativePath.split("/");
    const dirParts = parts.slice(0, parts.length - 1);
    
    let currentParentId = rootFolderId;
    
    for (const dirName of dirParts) {
      if (!dirName) continue;
      
      const existing = allFolders.find(f => f.name === dirName && f.parent_id === currentParentId);
      if (existing) {
        currentParentId = existing.id;
      } else {
        if (isSandbox) {
          const newFolderId = `sandbox-folder-${Date.now()}-${Math.random()}`;
          const newFolder: FolderMetadata = {
            id: newFolderId,
            owner_id: user?.userId || "demo-user",
            parent_id: currentParentId,
            name: dirName,
            created_at: new Date().toISOString()
          };
          allFolders.push(newFolder);
          setAllFolders([...allFolders]);
          currentParentId = newFolderId;
        } else if (user) {
          try {
            const folder = await apiCreateFolder(user.sessionToken, dirName, currentParentId);
            allFolders.push(folder);
            setAllFolders([...allFolders]);
            currentParentId = folder.id;
          } catch (err) {
            console.error(`Failed to create folder ${dirName}:`, err);
            throw err;
          }
        }
      }
    }
    
    return currentParentId;
  };

  // Promise-based duplicate filename resolver dialog
  const resolveDuplicate = (fileName: string, existingId: string): Promise<"overwrite" | "keep-both" | "skip"> => {
    return new Promise((resolve) => {
      setDuplicateFilePrompt({
        fileName,
        existingId,
        onResolve: (action) => {
          setDuplicateFilePrompt(null);
          resolve(action);
        }
      });
    });
  };

  // Recursive Directory Traversal
  const traverseDirectory = async (entry: any, pathStr = ""): Promise<{ file: File; relativePath: string }[]> => {
    const filesList: { file: File; relativePath: string }[] = [];
    
    const traverse = async (item: any, currentPath: string) => {
      if (item.isFile) {
        const file = await new Promise<File>((resolve, reject) => {
          item.file(resolve, reject);
        });
        filesList.push({ file, relativePath: currentPath + file.name });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entries = await new Promise<any[]>((resolve, reject) => {
          const readAll = () => {
            dirReader.readEntries((results: any[]) => {
              if (results.length === 0) {
                resolve(entriesList);
              } else {
                entriesList.push(...results);
                readAll();
              }
            }, reject);
          };
          const entriesList: any[] = [];
          readAll();
        });
        for (const entryItem of entries) {
          await traverse(entryItem, currentPath + item.name + "/");
        }
      }
    };
    
    await traverse(entry, pathStr);
    return filesList;
  };

  // Main Upload Queue processor
  const handleUploadQueue = async (uploadQueue: { file: File; relativePath: string }[]) => {
    if (!user || !privateKey) return;
    const currentUser = user;
    const currentKey = privateKey;
    setUploadError(null);
    setPanelMinimized(false);

    // Initialize batchUploads state
    const initialUploads: Record<string, { name: string; size: number; state: "encrypting" | "uploading" | "complete" | "failed"; error?: string }> = {};
    uploadQueue.forEach(item => {
      initialUploads[item.relativePath] = {
        name: item.file.name,
        size: item.file.size,
        state: "encrypting",
      };
    });
    setBatchUploads(initialUploads);
    setUploadState("encrypting");

    try {
      const rsaPublicKey = await getPublicKeyFromPrivateKey(currentKey);

      const uploadWorker = async (item: { file: File; relativePath: string }) => {
        const { file, relativePath } = item;
        try {
          // 1. Resolve folder hierarchy
          const targetFolderId = await getOrCreateFoldersInPath(relativePath, currentFolderId);

          // 2. Check for duplicates
          const existingDocs = isSandbox ? demoDocs : documents;
          const duplicate = existingDocs.find(d => d.name === file.name && d.folder_id === targetFolderId);
          
          let uploadName = file.name;
          let shouldOverwrite = false;

          if (duplicate) {
            const resolution = await resolveDuplicate(file.name, duplicate.id);
            if (resolution === "skip") {
              setBatchUploads(prev => {
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

          // 3. Encrypt file bytes
          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const { ciphertext, encryptedDek } = await encryptFile(fileBytes, rsaPublicKey);

          // 4. Update status to uploading
          setBatchUploads(prev => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], name: uploadName, state: "uploading" }
          }));

          if (isSandbox) {
            if (shouldOverwrite && duplicate) {
              setDemoDocs(prev => prev.filter(d => d.id !== duplicate.id));
            }
            const newDoc: SandboxDocument = {
              id: `sandbox-doc-${Date.now()}-${Math.random()}`,
              owner_id: currentUser.userId,
              name: uploadName,
              size: file.size,
              folder_id: targetFolderId,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              encrypted_dek: encryptedDek,
              ciphertext,
            };
            setDemoDocs(prev => [newDoc, ...prev]);
          } else {
            if (shouldOverwrite && duplicate) {
              await apiDeleteDocument(currentUser.sessionToken, duplicate.id);
            }
            const blob = new Blob([ciphertext as unknown as BlobPart], { type: "application/octet-stream" });
            await apiUploadDocument(currentUser.sessionToken, blob, uploadName, encryptedDek, targetFolderId);
          }

          // Mark complete
          setBatchUploads(prev => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "complete" }
          }));

          // Log Activity: Upload
          logActivity(currentUser.userId, "Upload", `Uploaded encrypted file: ${uploadName}`);

        } catch (err: unknown) {
          const errorObject = err as Error;
          const errorMsg = errorObject?.message || "Upload failed";
          setBatchUploads(prev => ({
            ...prev,
            [relativePath]: { ...prev[relativePath], state: "failed", error: errorMsg }
          }));
          throw err;
        }
      };

      // Execute sequentially to prevent race conditions during recursive folder creation
      for (const item of uploadQueue) {
        await uploadWorker(item).catch(err => console.error("Worker upload failure", err));
      }

      setUploadState("complete");
      setTimeout(() => {
        setUploadState("idle");
      }, 2000);

    } catch (err: unknown) {
      console.error("Batch upload outer failure:", err);
      const errorObject = err as Error;
      setUploadError(errorObject?.message || "Failed to process batch upload.");
      setUploadState("idle");
    } finally {
      // Refresh documents list
      if (!isSandbox) {
        try {
          const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
          setDocuments(docs);
        } catch (refreshErr) {
          console.error("Failed to refresh documents list:", refreshErr);
        }
      }
    }
  };

  const handleMultipleFilesUpload = async (files: FileList | File[]) => {
    const queue = Array.from(files).map(file => ({
      file,
      relativePath: file.name
    }));
    await handleUploadQueue(queue);
  };

  const onFolderSelectChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const queue = Array.from(e.target.files).map(file => ({
        file,
        relativePath: file.webkitRelativePath || file.name
      }));
      await handleUploadQueue(queue);
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
      handleMultipleFilesUpload(e.target.files);
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
      handleMultipleFilesUpload(e.dataTransfer.files);
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

  // Handle delete all files in folder
  const handleDeleteAllFiles = () => {
    if (!user) return;
    const count = documents.length;
    if (count === 0) return;

    toast.error(`Delete ${count} files from this folder?`, {
      description: "This will permanently delete all files in this folder from storage and database. This action cannot be undone.",
      duration: 10000,
      action: {
        label: "Delete All",
        onClick: async () => {
          setLoadingDocs(true);
          try {
            if (isSandbox) {
              setDemoDocs(prev => prev.filter(d => d.folder_id !== currentFolderId));
              toast.success(`Deleted ${count} files successfully (Sandbox)`);
            } else {
              if (currentFolderId === null) {
                // Delete all root documents by calling delete API on each
                await Promise.all(
                  documents.map(d => apiDeleteDocument(user.sessionToken, d.id))
                );
              } else {
                await apiDeleteFolderDocuments(user.sessionToken, currentFolderId);
              }
              const docs = await apiListDocuments(user.sessionToken, currentFolderId);
              setDocuments(docs);
              toast.success(`Deleted ${count} files successfully`);
            }
          } catch (err: any) {
            console.error(err);
            toast.error(err?.message || "Failed to delete all files");
          } finally {
            setLoadingDocs(false);
          }
        }
      },
      cancel: {
        label: "Cancel",
        onClick: () => {}
      }
    });
  };

  // Handle delete
  const handleDelete = (id: string) => {
    if (!user) return;
    const currentUser = user;
    
    toast.error("Move document to Recycle Bin?", {
       icon: null,
       action: {
         label: 'Move to Trash',
         onClick: async () => {
           setLoadingDocs(true);
           try {
             const docName = (isSandbox ? demoDocs : documents).find(d => d.id === id)?.name || "Unknown Document";
             if (isSandbox) {
               const trashTag: TagMetadata = {
                 id: "sandbox-trash-tag",
                 owner_id: currentUser.userId,
                 name: "TRASH",
                 color: "#E41613",
                 created_at: new Date().toISOString()
               };
               setDocTagsCache(prev => ({
                 ...prev,
                 [id]: [...(prev[id] || []), trashTag]
               }));
               toast.success("Document moved to Recycle Bin (Sandbox)");
             } else {
               if (!trashTagId) {
                 toast.error("Recycle bin not initialized yet");
                 return;
               }
               await apiTagDocument(currentUser.sessionToken, id, trashTagId);
               // Refresh docs
               const docs = await apiListDocuments(currentUser.sessionToken, currentFolderId);
               setDocuments(docs);
               // Fetch tag status for this doc
               try {
                 const dt = await apiListDocumentTags(currentUser.sessionToken, id);
                 setDocTagsCache(prev => ({ ...prev, [id]: dt }));
               } catch (e) {
                 console.error("Failed to update doc tags cache:", e);
               }
               toast.success("Document moved to Recycle Bin");
             }
             logActivity(currentUser.userId, "Delete", `Moved document to Recycle Bin: ${docName}`);
           } catch (err: unknown) {
             const errorObject = err as Error;
             toast.error(`Failed to delete: ${errorObject?.message || "Unknown error"}`);
           } finally {
             setLoadingDocs(false);
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

  // Filter documents by search query and tags, excluding trashed documents
  const displayedDocs = (isSandbox ? demoDocs : documents).filter((doc) => {
    const isTrashed = docTagsCache[doc.id]?.some((t: TagMetadata) => t.name.toLowerCase() === "trash");
    if (isTrashed) return false;

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

      {/* Sidebar Toggler Button (Fixed) */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-[18px] left-[18px] z-50 p-1.5 text-[#8E929F] hover:text-white rounded hover:bg-white/5 cursor-pointer transition-all duration-300"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

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
        sessionToken={user?.sessionToken}
      />

      {/* Main panel container */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-screen transition-[padding] duration-300 ${sidebarOpen ? "md:pl-64" : "md:pl-0"}`}>
        {/* Header Panel */}
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#15161A]/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div className={`flex items-center gap-3 transition-all duration-300 ${sidebarOpen ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "pl-12 opacity-100"}`}>
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
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="break-all text-xs font-semibold uppercase tracking-widest text-[#F5F5F0]/70 bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 px-3 py-1.5 cursor-pointer transition-all rounded-sm flex items-center gap-1.5"
                >
                  <Settings size={12} className="text-white/40" />
                  <span>Vault: {user.username}</span>
                </button>
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
        {viewMode === "vault" && (
          <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="font-serif text-2xl font-light tracking-wide text-white sm:text-3xl">
                  Document Vault
                </h1>
                
                {/* Breadcrumb Navigation */}
                <div className="mt-4 flex flex-wrap items-center gap-4 text-sm font-medium tracking-wider text-white/50">
                  <div className="flex flex-wrap items-center gap-2">
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
                  {currentFolderId && documents.length > 0 && (
                    <button
                      onClick={handleDeleteAllFiles}
                      className="text-xs font-bold uppercase tracking-widest text-red-500 hover:text-white hover:bg-red-600/10 border border-red-500/20 hover:border-red-500 px-3 py-1 transition-all cursor-pointer rounded"
                    >
                      Delete All Files
                    </button>
                  )}
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
                multiple
                className="hidden"
              />
              <input
                ref={folderInputRef}
                type="file"
                onChange={onFolderSelectChange}
                {...({ webkitdirectory: "", directory: "" } as any)}
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
                <div className="text-center p-6 flex flex-col items-center justify-center gap-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.15em] text-white/60 group-hover:text-white transition-colors duration-300">
                    Drag files/folders here, click to browse files, or{" "}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        folderInputRef.current?.click();
                      }}
                      className="underline text-[#E41613] hover:text-white cursor-pointer font-bold"
                    >
                      upload a folder
                    </button>
                  </p>
                  <p className="text-xs text-white/30 tracking-wide">
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
                <div className="py-16 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-[#E41613]" size={20} />
                  <span className="text-xs tracking-widest uppercase text-white/30">
                    LOADING ENCRYPTED METADATA...
                  </span>
                </div>
              ) : displayedDocs.length === 0 ? (
                <div className="py-16 text-center text-xs tracking-widest uppercase text-white/20">
                  No secure documents found in this vault
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="doc-table w-full text-left text-sm border-collapse">
                    <thead className="hidden sm:table-header-group">
                      <tr className="border-b border-white/5 text-micro font-semibold text-white/40 tracking-[0.2em]">
                        <th className="pb-4 pr-4 font-bold">Name</th>
                        <th className="pb-4 pr-4 font-bold whitespace-nowrap">Size</th>
                        <th className="pb-4 pr-4 font-bold whitespace-nowrap">Seal Date</th>
                        <th className="pb-4 text-right font-bold w-[380px]">Actions</th>
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
                              <File className="h-4 w-4 text-[#E41613] shrink-0" size={16} />
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
                          <td data-label="Size" className="py-4 pr-4 text-xs text-white/40 font-mono whitespace-nowrap">
                            {formatSize(doc.size)}
                          </td>
                          <td data-label="Seal Date" className="py-4 pr-4 text-xs text-white/40 whitespace-nowrap">
                            {formatDate(doc.created_at)}
                          </td>
                          <td data-label="Actions" className="py-4 sm:text-right w-full sm:whitespace-nowrap sm:w-[380px]">
                            <div className="grid grid-cols-2 sm:flex sm:flex-nowrap justify-items-start sm:justify-end gap-4 items-center">
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
                                   setShareDoc(doc);
                                }}
                                className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-[#E41613] hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Share2 size={12} />
                                Share
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
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Folder Notes Section */}
            <section className="panel-card p-6 mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-[#E41613]" />
                  <h3 className="font-serif text-sm font-semibold tracking-wide text-white uppercase">
                    Notes for {folderPath[folderPath.length - 1]?.name || "Root Folder"}
                  </h3>
                </div>
                {notesSaving ? (
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#E41613]/85 animate-pulse flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    Auto-saving...
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-mono tracking-widest text-white/30">
                    Sealed locally
                  </span>
                )}
              </div>
              <textarea
                value={notesText}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Write some quick notes or logs for this folder context... (Notes are fully zero-knowledge, encrypted in browser, and saved to secure local storage)"
                className="w-full min-h-28 bg-[#0D0E10] text-[#F5F5F0] border border-white/5 p-3 text-xs font-sans tracking-wide leading-relaxed outline-none focus:border-[#E41613]/40 rounded-sm custom-scrollbar resize-none"
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

      {/* Floating Batch Upload Progress Panel */}
      {Object.keys(batchUploads).length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#111215] border border-white/10 shadow-2xl transition-all duration-300 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#15161A] border-b border-white/10">
            <span className="text-xs font-bold tracking-widest text-white uppercase">
              Uploads ({Object.values(batchUploads).filter(u => u.state === "complete").length}/{Object.keys(batchUploads).length})
            </span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setPanelMinimized(prev => !prev)}
                className="text-[#8E929F] hover:text-white p-1 transition-colors cursor-pointer"
              >
                {panelMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button 
                onClick={() => setBatchUploads({})}
                className="text-[#8E929F] hover:text-red-500 p-1 transition-colors cursor-pointer"
                title="Dismiss panel"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Body */}
          {!panelMinimized && (
            <div className="max-h-60 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
              {Object.values(batchUploads).map((upload) => (
                <div key={upload.name} className="p-3 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white truncate" title={upload.name}>
                      {upload.name}
                    </p>
                    <p className="text-[10px] text-[#8E929F] mt-0.5">
                      {upload.size < 1024 ? `${upload.size} B` : `${(upload.size / 1024).toFixed(1)} KB`} • {upload.state}
                    </p>
                    {upload.error && (
                      <p className="text-[9px] text-[#E41613] mt-1 break-words font-mono">
                        {upload.error}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {upload.state === "encrypting" && (
                      <Lock size={14} className="text-amber-500 animate-pulse" />
                    )}
                    {upload.state === "uploading" && (
                      <div className="h-3 w-3 border-2 border-[#E41613] border-t-transparent rounded-full animate-spin" />
                    )}
                    {upload.state === "complete" && (
                      <CheckCircle2 size={14} className="text-green-500" />
                    )}
                    {upload.state === "failed" && (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recovery Phrase Onboarding Modal */}
      <RecoveryPhraseModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        mnemonic={recoveryMnemonic}
        username={user?.username || ""}
      />

      {/* Duplicate File Resolution Modal */}
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
              A document named <span className="text-white font-mono">"{duplicateFilePrompt.fileName}"</span> already exists in this destination folder.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => duplicateFilePrompt.onResolve("keep-both")}
                className="w-full py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors hover:bg-white/10 cursor-pointer"
              >
                Keep Both (Rename copy)
              </button>
              <button
                onClick={() => duplicateFilePrompt.onResolve("overwrite")}
                className="w-full py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors hover:bg-[#c31310] cursor-pointer"
              >
                Overwrite Existing File
              </button>
              <button
                onClick={() => duplicateFilePrompt.onResolve("skip")}
                className="w-full py-2.5 bg-transparent text-white/50 text-xs font-bold uppercase tracking-wider rounded transition-colors hover:text-white cursor-pointer"
              >
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
            {/* Close Button */}
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
              <Settings size={20} className="text-[#E41613]" />
              <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">
                Account Settings
              </h2>
            </div>

            {/* Content Tabs / Info */}
            <div className="space-y-6">
              {/* Profile Details */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  Secure Identity Context
                </h4>
                
                <div className="grid grid-cols-3 gap-2 text-xs border border-white/5 p-4 bg-[#15161A]/40">
                  <span className="text-white/40">Username</span>
                  <span className="col-span-2 text-white font-mono font-medium">{user?.username}</span>
                  
                  <span className="text-white/40">User UUID</span>
                  <span className="col-span-2 text-white font-mono break-all text-[11px]">{user?.userId}</span>
                  
                  <span className="text-white/40">Key Wrapping</span>
                  <span className="col-span-2 text-green-400 font-semibold uppercase text-[10px]">
                    AES-GCM (KEK Derived)
                  </span>
                </div>
              </div>

              {/* Public Key SPKI Card */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-[#8E929F] uppercase tracking-widest">
                  RSA-OAEP 2048 Public Key (SPKI)
                </h4>
                <div className="bg-black/40 border border-white/5 p-3 rounded-sm font-mono text-[9px] text-white/50 break-all select-all leading-normal max-h-20 overflow-y-auto custom-scrollbar">
                  {user?.publicKey}
                </div>
                <span className="block text-[9px] text-[#8E929F]/40 italic">
                  *Used by other users to encrypt DEKs for secure folder sharing.
                </span>
              </div>

              {/* Phase 2 Settings Notice */}
              <div className="border border-amber-500/20 bg-amber-500/5 p-4 rounded-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                  <div className="space-y-1">
                    <h5 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Phase 2 Integration Preview
                    </h5>
                    <p className="text-[11px] text-[#8E929F] leading-relaxed">
                      Zero-Knowledge features like changing the Master Password (requires key re-wrapping), Seed Phrase verification, and Profile Deletion are currently planned for the Phase 2 backend release.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 mt-8 border-t border-white/5 pt-4">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="py-2 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-white/10 cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
