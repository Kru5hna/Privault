"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  deriveAuthVerifier,
  deriveKEK,
  deriveRecoveryKEK,
  generateRSAKeyPair,
  exportPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  generateSalt,
  generateMnemonic,
} from "@/lib/crypto";
import {
  apiLogin,
  apiRegister,
  apiGetMe,
  apiGetSalts,
  apiLogout,
  apiStoreRecoveryKey,
  apiGetEmailStatus,
  UserSession,
  apiRecover,
  apiRecoveryChangePassword,
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
  register: (username: string, password: string, email?: string) => Promise<{ email_sent?: boolean }>;
  login: (username: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  enterSandbox: () => Promise<void>;
  recover: (username: string, recoveryPhrase: string, newPassword: string) => Promise<void>;
  clearError: () => void;
  /** Re-fetch /api/me and merge the email verification status into `user`. */
  refreshEmailStatus: () => Promise<void>;
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
        const me = await apiGetMe(session.sessionToken);

        // Session is valid — enter locked state. Preserve any stored
        // verification flags (older sessions may not have them).
        setUser({
          ...session,
          email: me.email ?? session.email ?? null,
          emailVerified: me.email_verified ?? session.emailVerified ?? false,
        });
        setStatus("locked");
      } catch (err) {
        console.error("Session restore failed:", err);
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setStatus("unauthenticated");
      }
    }

    restoreSession();
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────
  const loginInternal = useCallback(async (username: string, password: string) => {
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
    // Default email fields to "unknown" — they'll be refreshed by
    // refreshEmailStatus() below, which is best-effort.
    const session: UserSession = {
      sessionToken: response.session_token,
      userId: response.user_id,
      username: response.username,
      publicKey: response.public_key,
      authSalt: response.auth_salt,
      kekSalt: response.kek_salt,
      wrappedPrivateKey: response.wrapped_private_key,
      wrappedPrivateKeyIv: response.wrapped_private_key_iv,
      email: null,
      emailVerified: false,
    };

    // 7. Persist session token for session restore
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

    // 8. Update state — fully unlocked
    setUser(session);
    setPrivateKey(decryptedPrivateKey);
    setStatus("unlocked");
    router.push("/dashboard");

    // 9. Best-effort fetch of email verification status. Failures
    //    here must not block login.
    try {
      const status = await apiGetEmailStatus(response.session_token);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              email: status.email ?? null,
              emailVerified: status.email_verified,
            }
          : prev
      );
      // Mirror the refreshed state into localStorage so a hard refresh
      // doesn't lose the verified flag.
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed: UserSession = JSON.parse(stored);
        parsed.email = status.email ?? null;
        parsed.emailVerified = status.email_verified;
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn("Failed to fetch email verification status", err);
    }
  }, [router]);

  /**
   * Re-fetch the email verification status for the current session and
   * merge the result into the user object. Used by the banner after a user
   * dismisses it and later verifies, or after returning from /verify-email.
   */
  const refreshEmailStatus = useCallback(async () => {
    if (!user) return;
    try {
      const status = await apiGetEmailStatus(user.sessionToken);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              email: status.email ?? null,
              emailVerified: status.email_verified,
            }
          : prev
      );
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const parsed: UserSession = JSON.parse(stored);
        parsed.email = status.email ?? null;
        parsed.emailVerified = status.email_verified;
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
      }
    } catch (err) {
      console.warn("Failed to refresh email status", err);
    }
  }, [user]);

  // ── Register ─────────────────────────────────────────────────────────────
  const register = useCallback(async (username: string, password: string, email?: string) => {
    setStatus("loading");
    setError(null);
    let emailSent = false;
    try {
      // 1. Generate random salts
      const authSalt = generateSalt();
      const kekSalt = generateSalt();

      // 2. Derive auth verifier and KEK from password + respective salts
      const authVerifier = await deriveAuthVerifier(password, authSalt);
      const KEK = await deriveKEK(password, kekSalt);

      // Generate the 12-word recovery phrase during registration
      const mnemonic = await generateMnemonic();
      sessionStorage.setItem("privault_mnemonic_temp", mnemonic);
      sessionStorage.setItem("privault_show_recovery", "true");

      // 3. Generate RSA keypair
      const keyPair = await generateRSAKeyPair();
      const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

      // 4. Wrap private key with KEK
      const { wrappedKey, iv } = await wrapPrivateKey(keyPair.privateKey, KEK);

      // 5. Send everything to the backend
      const regResult = await apiRegister(
        username,
        authVerifier,
        authSalt,
        kekSalt,
        publicKeyBase64,
        wrappedKey,
        iv,
        email
      );

      emailSent = regResult.email_sent ?? false;

      // 6. Auto-login after successful registration
      await loginInternal(username, password);

      // 7. Derive recovery KEK from the mnemonic and store the recovery-wrapped key
      try {
        const recoveryKEK = await deriveRecoveryKEK(mnemonic);
        const { wrappedKey: recoveryWrappedKey, iv: recoveryWrappedKeyIv } =
          await wrapPrivateKey(keyPair.privateKey, recoveryKEK);
        const storedSession = localStorage.getItem("privault_session");
        if (storedSession) {
          const session = JSON.parse(storedSession);
          await apiStoreRecoveryKey(session.sessionToken, recoveryWrappedKey, recoveryWrappedKeyIv);
        }
      } catch (recoveryErr) {
        console.error("Failed to store recovery key (non-fatal):", recoveryErr);
      }
    } catch (err: unknown) {
      console.error("Registration failed:", err);
      sessionStorage.removeItem("privault_mnemonic_temp");
      sessionStorage.removeItem("privault_show_recovery");
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setStatus("unauthenticated");
      throw err;
    }
    return { email_sent: emailSent };
  }, [loginInternal]);

  const login = useCallback(async (username: string, password: string) => {
    sessionStorage.removeItem("privault_mnemonic_temp");
    sessionStorage.removeItem("privault_show_recovery");
    setStatus("loading");
    setError(null);
    try {
      await loginInternal(username, password);
    } catch (err: unknown) {
      console.error("Login failed:", err);
      const message = err instanceof Error ? err.message : "Invalid credentials";
      setError(message);
      setStatus("unauthenticated");
      throw err;
    }
  }, [loginInternal]);

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
    } catch (err) {
      console.error("Unlock failed:", err);
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
        authSalt: "",
        kekSalt: "",
        wrappedPrivateKey: "",
        wrappedPrivateKeyIv: "",
      };
      setUser(session);
      setPrivateKey(keyPair.privateKey);
      setStatus("unlocked");
      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Sandbox enter failed:", err);
      const message = err instanceof Error ? err.message : "Failed to enter sandbox";
      setError(message);
    }
  }, [router]);

  // ── Account Recovery ──────────────────────────────────────────────────────
  const recover = useCallback(async (username: string, recoveryPhrase: string, newPassword: string) => {
    setError(null);
    try {
      // 1. Authenticate with recovery phrase & fetch recovery key
      const response = await apiRecover(username.trim(), recoveryPhrase.trim());

      // 2. Derive recovery KEK from phrase
      const recoveryKek = await deriveRecoveryKEK(recoveryPhrase.trim());

      // 3. Decrypt RSA private key with recovery KEK
      const decryptedPrivateKey = await unwrapPrivateKey(
        response.recovery_wrapped_key,
        response.recovery_wrapped_key_iv,
        recoveryKek
      );

      // 4. Generate new password salts
      const newAuthSalt = await generateSalt();
      const newKekSalt = await generateSalt();

      // 5. Derive new auth verifier & new password KEK
      const newAuthVerifier = await deriveAuthVerifier(newPassword, newAuthSalt);
      const newKek = await deriveKEK(newPassword, newKekSalt);

      // 6. Wrap the decrypted private key with the new password KEK
      const { wrappedKey: newWrappedKey, iv: newWrappedKeyIv } = await wrapPrivateKey(
        decryptedPrivateKey,
        newKek
      );

      // 7. Update password material on server (re-keys account, clears old recovery)
      await apiRecoveryChangePassword(
        response.session_token,
        newAuthVerifier,
        newAuthSalt,
        newKekSalt,
        newWrappedKey,
        newWrappedKeyIv
      );

      // 8. Establish session locally
      const session: UserSession = {
        sessionToken: response.session_token,
        userId: response.user_id,
        username: response.username,
        publicKey: response.public_key,
        authSalt: newAuthSalt,
        kekSalt: newKekSalt,
        wrappedPrivateKey: newWrappedKey,
        wrappedPrivateKeyIv: newWrappedKeyIv,
        email: null,
        emailVerified: false,
      };

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      setUser(session);
      setPrivateKey(decryptedPrivateKey);
      setStatus("unlocked");
      router.push("/dashboard");
    } catch (err: unknown) {
      console.error("Account recovery failed:", err);
      const message = err instanceof Error ? err.message : "Failed to recover account";
      setError(message);
      throw err;
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
        recover,
        clearError,
        refreshEmailStatus,
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
