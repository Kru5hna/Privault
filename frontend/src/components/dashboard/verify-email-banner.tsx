"use client";

import React, { useState } from "react";
import { Mail, X, ShieldAlert } from "lucide-react";
import { useAuth } from "@/app/context";
import { VerifyEmailInfoModal } from "@/components/verify-email-info-modal";

/**
 * Whether email verification is currently enabled in this deployment.
 * Flip this to true once SES production access is approved and a resend
 * endpoint is wired. Until then, the banner CTA opens an info modal.
 */
const VERIFY_EMAIL_ENABLED =
  process.env.NEXT_PUBLIC_VERIFY_EMAIL_ENABLED === "true";

const DISMISS_KEY_PREFIX = "privault_verify_banner_dismissed_";

/**
 * Dismissible banner shown beneath the dashboard header when the user
 * is logged in but has not verified their email. Clicking the CTA:
 *  - If verification is enabled: opens the user's mail client via a
 *    dedicated info modal explaining the next step.
 *  - If verification is temporarily disabled: opens the
 *    VerifyEmailInfoModal with the "service being activated" copy.
 *
 * Dismissal is per-user, persisted in localStorage. If the user later
 * verifies, the banner auto-hides regardless of dismissal state.
 */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + (user?.userId ?? "")) === "1";
  });

  // ── Visibility rules ────────────────────────────────────────────────────
  // Hide if:
  //  - No user
  //  - User is verified
  //  - User has dismissed the banner for this user_id
  if (!user) return null;
  if (user.emailVerified === true) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY_PREFIX + user.userId, "1");
      setDismissed(true);
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
  };

  const handleCtaClick = () => {
    setInfoOpen(true);
  };

  return (
    <>
      <div
        role="status"
        className="relative z-20 border-b border-amber-500/20 bg-amber-500/[0.06] backdrop-blur-sm"
      >
        <div className="mx-auto flex w-full max-w-5xl items-start gap-3 px-4 py-2.5 sm:px-6 sm:items-center">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <ShieldAlert size={14} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-200/90 leading-snug">
              Your email is unverified.
            </p>
            <p className="text-[11px] text-amber-200/60 leading-snug mt-0.5">
              {VERIFY_EMAIL_ENABLED
                ? "Verify now to unlock all security features."
                : "Email verification is being activated. We'll let you know when it's ready."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleCtaClick}
            className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-200 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <Mail size={12} />
            Verify Email
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss verification banner"
            className="text-amber-200/40 hover:text-amber-200 transition-colors cursor-pointer p-1 -mr-1 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <VerifyEmailInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}