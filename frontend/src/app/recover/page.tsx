"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/context";

export default function RecoverPage() {
  const { recover, error, status, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const loading = status === "loading";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    const normalizedUsername = username.trim();
    const normalizedPhrase = recoveryPhrase.trim();

    if (!normalizedUsername || !normalizedPhrase || !newPassword || !confirmPassword) {
      setFormError("All fields are required");
      return;
    }

    if (normalizedPhrase.split(/\s+/).length !== 12) {
      setFormError("Recovery phrase must contain exactly 12 words");
      return;
    }

    if (newPassword.length < 8) {
      setFormError("New password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("New passwords do not match");
      return;
    }

    try {
      await recover(normalizedUsername, normalizedPhrase, newPassword);
    } catch {
      // Error handled by Auth Context
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0D0E10] px-4 py-8 sm:px-6 sm:py-12 dotted-grid-dark overflow-hidden">
      {/* Floating back link */}
      <Link
        href="/login"
        className="absolute top-6 left-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50 hover:text-[#E41613] transition-colors group z-20"
      >
        <svg
          className="h-4 w-4 transform transition-transform group-hover:-translate-x-1 text-[#E41613]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
          Back to Login
      </Link>

      {/* Visual background details */}
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-30" />
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md panel-card p-6 sm:p-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="font-serif text-2xl font-bold tracking-[0.25em] text-[#F5F5F0]">
              RECOVER
            </span>
            <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
          </div>
          <p className="mt-3 text-micro text-white/30 uppercase tracking-widest">
            Reset Master Password via Recovery Phrase
          </p>
        </div>

        {/* Errors */}
        {(formError || error) && (
          <div className="mb-6 border-l-2 border-[#E41613] bg-[#E41613]/10 p-4 text-xs tracking-wider uppercase text-[#F5F5F0]">
            {formError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="recover-username"
              className="block text-micro font-semibold text-white/50 mb-2"
            >
              Username
            </label>
            <input
              id="recover-username"
              type="text"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full input-tactical"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label
              htmlFor="recover-phrase"
              className="block text-micro font-semibold text-white/50 mb-2"
            >
              12-Word Recovery Phrase
            </label>
            <textarea
              id="recover-phrase"
              required
              disabled={loading}
              value={recoveryPhrase}
              onChange={(e) => setRecoveryPhrase(e.target.value)}
              rows={3}
              className="w-full input-tactical resize-none py-3"
              placeholder="word1 word2 ... word12"
            />
          </div>

          <div>
            <label
              htmlFor="recover-new-password"
              className="block text-micro font-semibold text-white/50 mb-2"
            >
              New Master Password
            </label>
            <input
              id="recover-new-password"
              type="password"
              required
              disabled={loading}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full input-tactical"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label
              htmlFor="recover-confirm-password"
              className="block text-micro font-semibold text-white/50 mb-2"
            >
              Confirm New Master Password
            </label>
            <input
              id="recover-confirm-password"
              type="password"
              required
              disabled={loading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full input-tactical"
              placeholder="Confirm new password"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full border-none cursor-pointer disabled:opacity-50"
            >
              <span className="btn-bg" />
              <span className="btn-text flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    RECOVERING VAULT...
                  </>
                ) : (
                  "RESET & RE-SEAL VAULT"
                )}
              </span>
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-xs text-white/40">
          Need to create a new vault?{" "}
          <Link
            href="/register"
            className="font-semibold text-white underline decoration-white/20 underline-offset-4 hover:text-[#E41613] hover:decoration-[#E41613] transition-colors"
          >
            Create Vault
          </Link>
        </div>
      </div>
    </div>
  );
}
