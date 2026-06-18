"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/context";

/**
 * Unlock Modal — shown when the user has a valid session but their
 * private key is not in memory (i.e. after a page refresh).
 */
export default function UnlockModal() {
  const { status, user, unlock, logout, error, clearError } = useAuth();
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Only render when in locked state
  if (status !== "locked") return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setUnlocking(true);
    clearError();

    try {
      await unlock(password);
    } catch {
      // Error is set in context
    } finally {
      setUnlocking(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
      {/* Background details for tactical ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md panel-card p-6 sm:p-10">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="font-serif text-2xl font-bold tracking-[0.25em] text-[#F5F5F0]">
              PRIVAULT
            </span>
            <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
          </div>
          <p className="mt-3 text-xs text-white/50">
            Welcome back, <span className="font-semibold text-white">{user?.username}</span>
          </p>
          <p className="mt-1 text-micro text-white/30">
            Enter your master password to unlock your vault
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 border-l-2 border-[#E41613] bg-[#E41613]/10 p-4 text-xs tracking-wider uppercase text-[#F5F5F0]">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-6">
          <div>
            <label
              htmlFor="unlock-password"
              className="block text-micro font-semibold text-white/50 mb-2"
            >
              Master Password
            </label>
            <input
              id="unlock-password"
              type="password"
              autoFocus
              required
              disabled={unlocking}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full input-tactical"
              placeholder="Enter master password"
            />
          </div>

          <button
            type="submit"
            disabled={unlocking}
            className="btn-primary w-full border-none cursor-pointer disabled:opacity-50"
          >
            <span className="btn-bg" />
            <span className="btn-text flex items-center justify-center gap-2">
              {unlocking ? (
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
                  DECRYPTING VAULT...
                </>
              ) : (
                "UNLOCK VAULT"
              )}
            </span >
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-xs text-white/40 underline underline-offset-4 hover:text-[#E41613] hover:decoration-[#E41613] transition-colors cursor-pointer"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
