"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  deriveAuthVerifier,
  deriveKEK,
  generateRSAKeyPair,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  generateSalt,
} from "@/lib/crypto";
import {
  apiLogin,
  apiRegister,
  apiGetMe,
  apiGetSalts,
  apiLogout,
  UserSession,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Auth State Machine
// ─────────────────────────────────────────────────────────────────────────────
//
//  loading      →  Checking if a stored session is still valid
//  unauthenticated →  No session, show login/register
//  locked       →  Valid session exists, but private key is NOT in memory.
//                    User must enter master password to unlock.
//  unlocked     →  Valid session + private key in memory. Full access.
//
// On page refresh: loading → locked (if session is valid) or unauthenticated
// On unlock:       locked → unlocked
// On logout:       any → unauthenticated

export type AuthStatus = "loading" | "unauthenticated" | "locked" | "unlocked";

interface AuthContextType {
  status: AuthStatus;
  user: UserSession | null;
  privateKey: CryptoKey | null;
  error: string | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  enterSandbox: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Storage key for persisted session (contains NO key material)
const SESSION_STORAGE_KEY = "privault_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserSession | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ── Session Restore ──────────────────────────────────────────────────────
  // On mount, check if we have a stored session token that's still valid.
  // If yes → locked state. If no → unauthenticated.
  // We NEVER store KEK or private key material.

  useEffect(() => {
    async function restoreSession() {
      try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!stored) {
          setStatus("unauthenticated");
          return;
        }

        const session: UserSession = JSON.parse(stored);

        // Verify the session token is still valid
        await apiGetMe(session.sessionToken);

        // Session is valid — enter locked state
        setUser(session);
        setStatus("locked");
      } catch {
        // Session expired or invalid — clean up
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setStatus("unauthenticated");
      }
    }

    restoreSession();
  }, []);

  // ── Register ─────────────────────────────────────────────────────────────
  const register = useCallback(async (username: string, password: string) => {
    setStatus("loading");
    setError(null);
    try {
      // 1. Generate random salts
      const authSalt = generateSalt();
      const kekSalt = generateSalt();

      // 2. Derive auth verifier and KEK from password + respective salts
      const authVerifier = await deriveAuthVerifier(password, authSalt);
      const KEK = await deriveKEK(password, kekSalt);

      // 3. Generate RSA keypair
      const keyPair = await generateRSAKeyPair();
      const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

      // 4. Wrap private key with KEK
      const { wrappedKey, iv } = await wrapPrivateKey(keyPair.privateKey, KEK);

      // 5. Send everything to the backend
      await apiRegister(
        username,
        authVerifier,
        authSalt,
        kekSalt,
        publicKeyBase64,
        wrappedKey,
        iv
      );

      // 6. Auto-login after successful registration
      await loginInternal(username, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setStatus("unauthenticated");
      throw err;
    }
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────
  const loginInternal = async (username: string, password: string) => {
    // 1. Fetch the user's salts (public endpoint)
    const salts = await apiGetSalts(username);

    // 2. Derive auth verifier from password + auth_salt
    const authVerifier = await deriveAuthVerifier(password, salts.auth_salt);

    // 3. Authenticate
    const response = await apiLogin(username, authVerifier);

    // 4. Derive KEK from password + kek_salt
    const KEK = await deriveKEK(password, response.kek_salt);

    // 5. Unwrap private key
    const decryptedPrivateKey = await unwrapPrivateKey(
      response.wrapped_private_key,
      response.wrapped_private_key_iv,
      KEK
    );

    // 6. Build session object (no key material stored!)
    const session: UserSession = {
      sessionToken: response.session_token,
      userId: response.user_id,
      username: response.username,
      publicKey: response.public_key,
      kekSalt: response.kek_salt,
      wrappedPrivateKey: response.wrapped_private_key,
      wrappedPrivateKeyIv: response.wrapped_private_key_iv,
    };

    // 7. Persist session token for session restore
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

    // 8. Update state — fully unlocked
    setUser(session);
    setPrivateKey(decryptedPrivateKey);
    setStatus("unlocked");
    router.push("/dashboard");
  };

  const login = useCallback(async (username: string, password: string) => {
    setStatus("loading");
    setError(null);
    try {
      await loginInternal(username, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid credentials";
      setError(message);
      setStatus("unauthenticated");
      throw err;
    }
  }, []);

  // ── Unlock ───────────────────────────────────────────────────────────────
  // Called when in "locked" state — user enters master password to unlock.
  const unlock = useCallback(async (password: string) => {
    setError(null);
    if (!user) {
      setError("No active session to unlock");
      return;
    }

    try {
      // Derive KEK from password + stored kek_salt
      const KEK = await deriveKEK(password, user.kekSalt);

      // Unwrap the private key
      const decryptedPrivateKey = await unwrapPrivateKey(
        user.wrappedPrivateKey,
        user.wrappedPrivateKeyIv,
        KEK
      );

      setPrivateKey(decryptedPrivateKey);
      setStatus("unlocked");
    } catch {
      setError("Incorrect master password");
    }
  }, [user]);

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      if (user?.sessionToken) {
        await apiLogout(user.sessionToken);
      }
    } catch {
      // Best-effort logout — clear local state regardless
    }

    setUser(null);
    setPrivateKey(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setStatus("unauthenticated");
    router.push("/login");
  }, [user, router]);

  // ── Sandbox Mode ─────────────────────────────────────────────────────────
  const enterSandbox = useCallback(async () => {
    setError(null);
    try {
      const keyPair = await generateRSAKeyPair();
      const session: UserSession = {
        sessionToken: "sandbox_mock_token",
        userId: "sandbox-user-id",
        username: "sandbox-visitor",
        publicKey: "",
        kekSalt: "",
        wrappedPrivateKey: "",
        wrappedPrivateKeyIv: "",
      };
      setUser(session);
      setPrivateKey(keyPair.privateKey);
      setStatus("unlocked");
      router.push("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to enter sandbox";
      setError(message);
    }
  }, [router]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        privateKey,
        error,
        register,
        login,
        unlock,
        logout,
        enterSandbox,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
