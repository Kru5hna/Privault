"use client";

import React from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface VerifyEmailInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Shown in place of a real "verify your email" flow when the email
 * service is unavailable (SES still in sandbox, or temporarily down).
 *
 * Used by:
 *  - The verification banner's CTA on the dashboard
 *  - The "Verify Email" badges inside Account Settings
 *
 * Communicates three things:
 *  1. Verification is being activated (not broken)
 *  2. The user's account and data are safe
 *  3. They don't need to do anything for now
 */
export function VerifyEmailInfoModal({ isOpen, onClose }: VerifyEmailInfoModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      zIndex={170}
      data-testid="verify-email-info-modal"
    >
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/30">
          <Mail className="text-[#E41613]" size={26} />
        </div>

        <h2 className="font-serif text-xl font-bold text-white tracking-wide">
          EMAIL VERIFICATION
        </h2>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          Coming Soon
        </p>

        <p className="mt-5 text-sm text-white/70 leading-relaxed">
          We're activating email verification for your account. You'll be
          able to confirm your email address as soon as the service is ready.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] p-4 text-left">
          <ShieldCheck className="text-green-400 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-white/60 leading-relaxed">
            <span className="block font-bold uppercase tracking-wider text-white/80 mb-1">
              Your account is safe
            </span>
            All files remain encrypted on your device. Your vault is fully
            usable while verification is being activated.
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-wider rounded cursor-pointer transition-colors"
        >
          Got it
        </button>
      </div>
    </Modal>
  );
}