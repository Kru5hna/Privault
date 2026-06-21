"use client";

import React, { useState } from "react";
import { 
  DocumentMetadata, 
  UserSession, 
  TagMetadata, 
  apiDeleteDocument, 
  apiUntagDocument 
} from "@/lib/api";
import { Trash2, RotateCcw, ShieldAlert, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

interface TrashPanelProps {
  user: UserSession;
  documents: DocumentMetadata[];
  docTagsCache: Record<string, TagMetadata[]>;
  isSandbox: boolean;
  onRefresh: () => Promise<void>;
  trashTagId: string | null;
  setDemoDocs: React.Dispatch<React.SetStateAction<DocumentMetadata[]>>;
}

export function TrashPanel({
  user,
  documents,
  docTagsCache,
  isSandbox,
  onRefresh,
  trashTagId,
  setDemoDocs,
}: TrashPanelProps) {
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentMetadata | null>(null);
  const [processing, setProcessing] = useState(false);

  // Filter documents that are trashed
  const trashedDocs = documents.filter((doc) => {
    return docTagsCache[doc.id]?.some((t) => t.name.toLowerCase() === "trash");
  });

  const handleRestore = async (doc: DocumentMetadata) => {
    setProcessing(true);
    try {
      if (isSandbox) {
        // In sandbox, we just remove the tag from our mock docs cache or update local cache
        // We can trigger refresh or simulate it
        toast.success(`Restored "${doc.name}" successfully (Sandbox)`);
      } else {
        if (!trashTagId) {
          throw new Error("Trash tag reference missing");
        }
        await apiUntagDocument(user.sessionToken, doc.id, trashTagId);
        toast.success(`Restored "${doc.name}" successfully`);
      }
      
      logActivity(user.userId, "Restore", `Restored document ${doc.name}`);
      await onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to restore document");
    } finally {
      setProcessing(false);
    }
  };

  const handlePermanentDelete = async (doc: DocumentMetadata) => {
    setProcessing(true);
    try {
      if (isSandbox) {
        setDemoDocs((prev) => prev.filter((d) => d.id !== doc.id));
        toast.success(`Permanently deleted "${doc.name}" (Sandbox)`);
      } else {
        await apiDeleteDocument(user.sessionToken, doc.id);
        toast.success(`Permanently deleted "${doc.name}"`);
      }

      logActivity(user.userId, "Delete", `Permanently deleted document ${doc.name}`);
      setConfirmDeleteDoc(null);
      await onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete document permanently");
    } finally {
      setProcessing(false);
    }
  };

  const handleEmptyTrash = async () => {
    setProcessing(true);
    try {
      if (isSandbox) {
        setDemoDocs((prev) => prev.filter((d) => !docTagsCache[d.id]?.some((t) => t.name.toLowerCase() === "trash")));
        toast.success("Trash emptied successfully (Sandbox)");
      } else {
        for (const doc of trashedDocs) {
          await apiDeleteDocument(user.sessionToken, doc.id).catch(err => {
            console.error(`Failed to delete ${doc.name} during empty:`, err);
          });
        }
        toast.success("Trash emptied successfully");
      }

      logActivity(user.userId, "Delete", "Emptied secure trash bin");
      setConfirmEmpty(false);
      await onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to empty trash");
    } finally {
      setProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 className="font-serif text-xl font-light text-white sm:text-2xl">
            Recycle Bin
          </h2>
          <p className="text-xs text-[#8E929F] mt-1">
            Documents here are still encrypted. Emptying the trash will permanently destroy the ciphertext and key references.
          </p>
        </div>

        {trashedDocs.length > 0 && (
          <button
            onClick={() => setConfirmEmpty(true)}
            disabled={processing}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#E41613] hover:text-white border border-[#E41613]/30 hover:border-[#E41613] hover:bg-[#E41613]/5 px-4 py-2 transition-colors cursor-pointer rounded"
          >
            <Trash2 size={14} />
            Empty Trash Bin
          </button>
        )}
      </div>

      {/* Main List */}
      {trashedDocs.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-white/5 bg-[#111215] p-6 rounded flex flex-col items-center justify-center gap-3">
          <Trash2 className="w-12 h-12 text-[#5E626F] opacity-40 animate-pulse" />
          <span className="text-xs tracking-widest uppercase text-white/30">
            Trash bin is empty
          </span>
        </div>
      ) : (
        <div className="bg-[#111215] border border-white/5 overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-micro font-semibold text-white/40 tracking-[0.2em] bg-black/20">
                <th className="p-4 font-bold">Name</th>
                <th className="p-4 font-bold">Size</th>
                <th className="p-4 text-right font-bold w-[240px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {trashedDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-4 font-mono text-xs text-white max-w-xs truncate">
                    {doc.name}
                  </td>
                  <td className="p-4 text-xs font-mono text-white/40">
                    {formatSize(doc.size)}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-3 items-center">
                      <button
                        onClick={() => handleRestore(doc)}
                        disabled={processing}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-green-400 hover:text-white transition-colors cursor-pointer"
                        title="Restore Document"
                      >
                        <RotateCcw size={12} />
                        Restore
                      </button>
                      
                      <button
                        onClick={() => setConfirmDeleteDoc(doc)}
                        disabled={processing}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#E41613] hover:underline transition-colors cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 size={12} />
                        Delete Permanently
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal: Empty Trash */}
      {confirmEmpty && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-[#111215] border border-red-500/20 p-6 rounded text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
              <ShieldAlert size={24} />
            </div>
            <h3 className="font-serif text-base font-bold text-white mb-2 uppercase tracking-wide">
              Confirm Purge
            </h3>
            <p className="text-xs text-[#8E929F] mb-6 leading-relaxed">
              Are you sure you want to permanently delete all {trashedDocs.length} documents from storage? This action is irreversible.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleEmptyTrash}
                className="flex-1 py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
              >
                Permanently Purge All
              </button>
              <button
                onClick={() => setConfirmEmpty(false)}
                className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Single Permanent Delete */}
      {confirmDeleteDoc && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 backdrop-blur-xs px-4">
          <div className="w-full max-w-sm bg-[#111215] border border-red-500/20 p-6 rounded text-center">
            <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-serif text-base font-bold text-white mb-2 uppercase tracking-wide">
              Permanent Deletion
            </h3>
            <p className="text-xs text-[#8E929F] mb-6 leading-relaxed">
              Are you sure you want to permanently delete <span className="text-white font-semibold">&quot;{confirmDeleteDoc.name}&quot;</span>? There is no way to recover this file.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handlePermanentDelete(confirmDeleteDoc)}
                className="flex-1 py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDeleteDoc(null)}
                className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
