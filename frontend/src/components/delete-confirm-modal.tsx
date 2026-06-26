"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface DeleteConfirmModalProps {
  username: string;
  confirmText: string;
  onConfirmTextChange: (text: string) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export function DeleteConfirmModal({
  username,
  confirmText,
  onConfirmTextChange,
  onConfirm,
  onClose,
  loading,
}: DeleteConfirmModalProps) {
  const isConfirmed = confirmText === username;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      zIndex={170}
      // Destructive flow — require explicit confirmation, not accidental
      // backdrop click. The Cancel/Delete Forever buttons remain the only
      // way out.
      dismissibleByBackdrop={!loading}
      data-testid="delete-confirm-modal"
    >
      <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
        <AlertTriangle size={20} className="text-[#E41613]" />
        <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">
          Delete Account
        </h2>
      </div>

      <div className="space-y-4">
        <div className="border-l-2 border-[#E41613] bg-[#E41613]/10 p-4 rounded-r">
          <p className="text-xs text-white/80 font-semibold leading-relaxed">
            This will permanently delete your account and all associated data,
            including all encrypted files, folders, share links, and tags. This
            action cannot be undone.
          </p>
        </div>

        <p className="text-xs text-white/50">
          Type{" "}
          <span className="text-white font-mono font-bold">{username}</span> to
          confirm deletion:
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
          className="w-full bg-black/40 border border-white/10 p-3 text-sm text-white font-mono outline-none focus:border-[#E41613]/50 transition-colors"
          placeholder={username}
          autoFocus
        />

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="py-2 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-white/10 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed || loading}
            className="py-2 px-4 bg-[#E41613] disabled:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-[#E41613]/80 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Deleting..." : "Delete Forever"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
