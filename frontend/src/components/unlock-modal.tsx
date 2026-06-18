"use client";

import React, { useState } from "react";
import { useAuth } from "@/app/context";

/**
 * Unlock Modal — shown when the user has a valid session but their
 * private key is not in memory (i.e. after a page refresh).
 *
 * The user must re-enter their master password to derive the KEK
 * and unwrap their private key. This is a core security feature:
 * we never persist key material, only the session token.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md border border-[#E5E7EB] bg-white p-6 shadow-lg sm:p-10">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-xl font-bold tracking-[0.2em] text-[#2B2B2B]">
              PRIVAULT
            </span>
            <span className="h-2 w-2 bg-[#E41613]"></span>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            Welcome back, <span className="font-semibold text-[#2B2B2B]">{user?.username}</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Enter your master password to unlock your vault
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 border-l-2 border-[#E41613] bg-red-50 p-4 text-sm text-[#E41613]">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-6">
          <div>
            <label
              htmlFor="unlock-password"
              className="block text-xs font-semibold uppercase tracking-wider text-[#2B2B2B]"
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
              className="mt-2 w-full border-b border-gray-200 py-2 text-sm text-[#2B2B2B] outline-none transition-colors placeholder:text-gray-300 focus:border-[#E41613]"
              placeholder="Enter master password"
            />
          </div>

          <button
            type="submit"
            disabled={unlocking}
            className="flex w-full items-center justify-center border border-[#2B2B2B] bg-[#2B2B2B] px-3 py-3 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#E41613] hover:border-[#E41613] disabled:opacity-50"
          >
            {unlocking ? (
              <span className="flex items-center justify-center gap-2">
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
              </span>
            ) : (
              <span className="tracking-widest uppercase">Unlock Vault</span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 underline underline-offset-4 hover:text-[#E41613] transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
