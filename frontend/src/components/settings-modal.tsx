"use client";

import React, { useState } from "react";
import {
  Settings,
  ShieldCheck,
  KeyRound,
  Lock,
  Monitor,
  Trash2,
  ChevronDown,
  ChevronRight,
  Copy,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { VerifyEmailInfoModal } from "@/components/verify-email-info-modal";
import { UserSession } from "@/lib/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserSession;
  onOpenRecoveryPhrase: () => void;
  onOpenChangePassword: () => void;
  onOpenSessionManagement: () => void;
  onOpenDeleteAccount: () => void;
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  locked: boolean;
  lockedReason: string;
  onClick: () => void;
  destructive?: boolean;
}

function ActionRow({
  icon,
  label,
  description,
  locked,
  lockedReason,
  onClick,
  destructive,
}: ActionRowProps) {
  if (locked) {
    return (
      <div
        className="w-full px-4 py-3 text-left opacity-50 cursor-not-allowed select-none border-b border-white/5 last:border-b-0"
        title={lockedReason}
      >
        <div className="flex items-center gap-3">
          <span className="text-white/30">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white/40">{label}</div>
            {description && (
              <div className="text-[10px] text-white/25 mt-0.5">{description}</div>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300/80"
            aria-label={lockedReason}
          >
            <Mail size={10} />
            Verify Email
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full flex items-center gap-3 px-4 py-3 text-xs text-left transition-colors cursor-pointer group",
        "border-b border-white/5 last:border-b-0",
        destructive
          ? "hover:bg-[#E41613]/10"
          : "hover:bg-[#1E2026]",
      ].join(" ")}
    >
      <span className={destructive ? "text-[#E41613]/80" : "text-white/50 group-hover:text-white"}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={
            destructive
              ? "text-[#E41613]/90 group-hover:text-[#E41613] font-medium"
              : "text-white/70 group-hover:text-white"
          }
        >
          {label}
        </div>
        {description && (
          <div className="text-[10px] text-white/30 mt-0.5 group-hover:text-white/40">
            {description}
          </div>
        )}
      </div>
      <ChevronRight
        size={14}
        className="text-white/30 group-hover:text-[#E41613] transition-colors"
      />
    </button>
  );
}

/**
 * Account Settings modal.
 *
 * Layout:
 *  - Account section (username, email, encryption status)
 *  - Security section (recovery phrase, master password, sessions, delete)
 *      - Each gated behind `emailVerified === true` (disabled, not hidden)
 *  - Advanced disclosure (UUID + public key)
 */
export function SettingsModal({
  isOpen,
  onClose,
  user,
  onOpenRecoveryPhrase,
  onOpenChangePassword,
  onOpenSessionManagement,
  onOpenDeleteAccount,
}: SettingsModalProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [verifyInfoOpen, setVerifyInfoOpen] = useState(false);
  const verified = user.emailVerified === true;

  const lockedReason = "Verify your email to unlock this security feature.";

  const handleLockedClick = () => {
    if (!verified) setVerifyInfoOpen(true);
  };

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Failed to copy. Select the text manually.");
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        zIndex={150}
        data-testid="settings-modal"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4 pr-8">
          <Settings size={20} className="text-[#E41613]" />
          <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">
            Account Settings
          </h2>
        </div>

        {/* Unverified warning strip — replaces a modal/banner for visibility */}
        {!verified && (
          <div className="mb-6 flex items-start gap-3 rounded border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
            <Mail className="text-amber-400 shrink-0 mt-0.5" size={16} />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-200">
                Security features are limited until you verify your email.
              </p>
              <p className="text-[11px] text-amber-200/60 mt-1 leading-relaxed">
                Verification protects account recovery. Once verified, all
                security actions below will become available.
              </p>
            </div>
          </div>
        )}

        {/* ── Account section ──────────────────────────────────────────── */}
        <section className="mb-6 space-y-3">
          <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
            <span className="h-3 w-1 bg-[#E41613]" />
            Account
          </h3>
          <div className="rounded border border-white/5 bg-[#15161A]/40 divide-y divide-white/5">
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-xs">
              <span className="text-white/40">Username</span>
              <span className="col-span-2 text-white font-mono font-medium">
                {user.username}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-xs">
              <span className="text-white/40">Email</span>
              <span className="col-span-2 flex items-center gap-2">
                <span className="text-white font-mono font-medium truncate">
                  {user.email || "—"}
                </span>
                {verified ? (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-300">
                    <ShieldCheck size={10} />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-sm border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Unverified
                  </span>
                )}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-xs">
              <span className="text-white/40">Encryption</span>
              <span className="col-span-2 flex items-center gap-2">
                <Lock size={12} className="text-green-400" />
                <span className="text-green-400 font-semibold uppercase text-[10px] tracking-wider">
                  End-to-end
                </span>
                <span className="text-white/40 text-[10px]">
                  Files encrypted on your device before upload
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ── Security section ─────────────────────────────────────────── */}
        <section className="mb-6 space-y-3">
          <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
            <span className="h-3 w-1 bg-[#E41613]" />
            Security
          </h3>
          <div className="rounded border border-white/5 bg-[#15161A]/40 overflow-hidden">
            <ActionRow
              icon={<KeyRound size={14} />}
              label="View Recovery Phrase"
              description="12-word seed phrase for account recovery"
              locked={!verified}
              lockedReason={lockedReason}
              onClick={verified ? onOpenRecoveryPhrase : handleLockedClick}
            />
            <ActionRow
              icon={<Lock size={14} />}
              label="Change Master Password"
              description="Rotate your master password and re-wrap your keys"
              locked={!verified}
              lockedReason={lockedReason}
              onClick={verified ? onOpenChangePassword : handleLockedClick}
            />
            <ActionRow
              icon={<Monitor size={14} />}
              label="Active Sessions"
              description="Review and revoke devices signed in to your vault"
              locked={!verified}
              lockedReason={lockedReason}
              onClick={verified ? onOpenSessionManagement : handleLockedClick}
            />
            <ActionRow
              icon={<Trash2 size={14} />}
              label="Delete Account"
              description="Permanently destroy your vault and all data"
              locked={!verified}
              lockedReason={lockedReason}
              onClick={verified ? onOpenDeleteAccount : handleLockedClick}
              destructive
            />
          </div>
        </section>

        {/* ── Advanced disclosure ──────────────────────────────────────── */}
        <section className="mb-2 space-y-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white/60 transition-colors cursor-pointer"
            aria-expanded={advancedOpen}
          >
            {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span className="h-3 w-1 bg-white/20" />
            Advanced
          </button>

          {advancedOpen && (
            <div className="space-y-3 rounded border border-white/5 bg-[#15161A]/40 p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    User UUID
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(user.userId, "User UUID")}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <Copy size={10} />
                    Copy
                  </button>
                </div>
                <p className="text-[11px] text-white/30 leading-relaxed">
                  Internal account identifier. Only needed when contacting
                  support.
                </p>
                <div className="bg-black/40 border border-white/5 p-2.5 rounded-sm font-mono text-[10px] text-white/50 break-all select-all leading-relaxed">
                  {user.userId}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    Public Key (SPKI)
                  </h4>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(user.publicKey, "Public key")}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <Copy size={10} />
                    Copy
                  </button>
                </div>
                <p className="text-[11px] text-white/30 leading-relaxed">
                  Base64 SPKI of your RSA public key. Useful for verifying
                  key fingerprints or sharing with tools that encrypt for
                  your account.
                </p>
                <div className="bg-black/40 border border-white/5 p-2.5 rounded-sm font-mono text-[9px] text-white/50 break-all select-all leading-relaxed max-h-20 overflow-y-auto custom-scrollbar">
                  {user.publicKey || "(empty)"}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="flex justify-end mt-6 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </Modal>

      <VerifyEmailInfoModal
        isOpen={verifyInfoOpen}
        onClose={() => setVerifyInfoOpen(false)}
      />
    </>
  );
}