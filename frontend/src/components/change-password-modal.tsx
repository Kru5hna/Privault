"use client";

import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface ChangePasswordModalProps {
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  loading: boolean;
}

export function ChangePasswordModal({
  onClose,
  onSubmit,
  loading,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    try {
      await onSubmit(currentPassword, newPassword);
    } catch {
      setError("Failed to change password. Check your current password.");
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="md"
      zIndex={170}
      // Mid-typing form — require explicit Cancel/Submit, not a stray click.
      dismissibleByBackdrop={!loading}
      data-testid="change-password-modal"
    >
      <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4">
        <Lock size={20} className="text-[#E41613]" />
        <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">
          Change Master Password
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
            Current Password
          </label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-3 pr-10 text-sm text-white font-mono outline-none focus:border-[#E41613]/50 transition-colors"
              placeholder="Enter current password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 cursor-pointer"
            >
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 p-3 pr-10 text-sm text-white font-mono outline-none focus:border-[#E41613]/50 transition-colors"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 cursor-pointer"
            >
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-black/40 border border-white/10 p-3 text-sm text-white font-mono outline-none focus:border-[#E41613]/50 transition-colors"
            placeholder="Re-enter new password"
          />
        </div>

        {error && <p className="text-xs text-[#E41613]">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-white/10 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="py-2 px-4 bg-[#E41613] disabled:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-[#E41613]/80 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Changing..." : "Change Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
