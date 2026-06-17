"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/context";

export default function RegisterPage() {
  const { register, error, loading, clearError, enterSandbox } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!username.trim() || !password.trim()) {
      setFormError("All fields are required");
      return;
    }

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    try {
      await register(username.trim(), password);
    } catch (err) {
      // Error handled by Auth Context
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-md border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-10">
        {/* Brand Logo Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-xl font-bold tracking-[0.2em] text-[#2B2B2B]">
              PRIVAULT
            </span>
            <span className="h-2 w-2 bg-[#E41613]"></span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-gray-400">
            Create Encrypted Vault
          </p>
        </div>

        {/* Errors */}
        {(formError || error) && (
          <div className="mb-6 border-l-2 border-[#E41613] bg-red-50 p-4 text-sm text-[#E41613]">
            {formError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-wider text-[#2B2B2B]"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-2 w-full border-b border-gray-200 py-2 text-sm text-[#2B2B2B] outline-none transition-colors placeholder:text-gray-300 focus:border-[#E41613]"
              placeholder="Enter username"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-[#2B2B2B]"
            >
              Master Password
            </label>
            <input
              id="password"
              type="password"
              required
              disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border-b border-gray-200 py-2 text-sm text-[#2B2B2B] outline-none transition-colors placeholder:text-gray-300 focus:border-[#E41613]"
              placeholder="Min. 8 characters"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold uppercase tracking-wider text-[#2B2B2B]"
            >
              Confirm Master Password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              disabled={loading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 w-full border-b border-gray-200 py-2 text-sm text-[#2B2B2B] outline-none transition-colors placeholder:text-gray-300 focus:border-[#E41613]"
              placeholder="Confirm password"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full items-center justify-center border border-[#2B2B2B] bg-[#2B2B2B] px-3 py-3 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-[#E41613] hover:border-[#E41613] disabled:opacity-50"
            >
              {loading ? (
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
                  DERIVING KEYS & REGISTERING...
                </span>
              ) : (
                <span className="tracking-widest uppercase">Register Vault</span>
              )}
            </button>
            <button
              type="button"
              onClick={enterSandbox}
              className="mt-4 flex w-full items-center justify-center border border-dashed border-[#2B2B2B] px-3 py-3 text-center text-sm font-semibold text-[#2B2B2B] hover:text-[#E41613] hover:border-[#E41613] transition-colors uppercase tracking-wider"
            >
              Try Offline Demo Sandbox
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-xs text-gray-500">
          Already have a vault?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#2B2B2B] underline decoration-gray-300 underline-offset-4 hover:text-[#E41613] hover:decoration-[#E41613]"
          >
            Access Vault
          </Link>
        </div>
      </div>
    </div>
  );
}
