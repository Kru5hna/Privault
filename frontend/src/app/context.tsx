"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deriveCredentials,
  unwrapPrivateKey,
  importPublicKey,
  generateRSAKeyPair,
  exportPublicKey,
  wrapPrivateKey,
} from "@/lib/crypto";
import { apiLogin, apiRegister, apiGetMe, UserSession } from "@/lib/api";

interface AuthContextType {
  user: UserSession | null;
  privateKey: CryptoKey | null;
  loading: boolean;
  error: string | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  enterSandbox: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Attempt auto-login if token & session info is present
    async function restoreSession() {
      try {
        const storedUser = localStorage.getItem("privault_session");
        const cachedKekBase64 = sessionStorage.getItem("privault_kek");

        if (storedUser && cachedKekBase64) {
          const parsedUser: UserSession = JSON.parse(storedUser);

          // Verify token validity with backend
          await apiGetMe(parsedUser.token);

          // Re-import KEK from sessionStorage to decrypt private key
          const rawKek = new Uint8Array(
            atob(cachedKekBase64)
              .split("")
              .map((c) => c.charCodeAt(0))
          );
          const KEK = await window.crypto.subtle.importKey(
            "raw",
            rawKek,
            { name: "AES-GCM" },
            false,
            ["unwrapKey"]
          );

          // Unwrap private key
          const decryptedPrivateKey = await unwrapPrivateKey(
            parsedUser.wrappedPrivateKey,
            sessionStorage.getItem("privault_pk_iv") || "",
            KEK
          );

          setUser(parsedUser);
          setPrivateKey(decryptedPrivateKey);
        } else {
          // Clear any partial session
          localStorage.removeItem("privault_session");
          sessionStorage.removeItem("privault_kek");
          sessionStorage.removeItem("privault_pk_iv");
        }
      } catch (err) {
        console.error("Failed to restore session", err);
        logout();
      } finally {
        setLoading(false);
      }
    }

    restoreSession();
  }, []);

  const register = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Derive KEK and Auth Hash
      const { KEK, authHash } = await deriveCredentials(username, password);

      // 2. Generate E2EE RSA Keypair
      const keyPair = await generateRSAKeyPair();

      // 3. Export Public Key (SPKI Base64)
      const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

      // 4. Wrap Private Key using KEK
      const { wrappedKey, iv } = await wrapPrivateKey(keyPair.privateKey, KEK);
      const combinedWrappedPrivateKey = `${iv}:${wrappedKey}`;

      // 5. Send payload to backend register endpoint
      await apiRegister(username, authHash, publicKeyBase64, combinedWrappedPrivateKey);

      // 6. Automatically log in the user after successful registration
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Registration failed");
      setLoading(false);
      throw err;
    }
  };

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. Derive KEK and Auth Hash
      const { KEK, authHash } = await deriveCredentials(username, password);

      // 2. Call backend login endpoint
      const response = await apiLogin(username, authHash);

      // 3. Store KEK in sessionStorage so private key can be unwrapped on refresh
      const exportedKek = await window.crypto.subtle.exportKey("raw", KEK);
      const kekBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKek)));
      sessionStorage.setItem("privault_kek", kekBase64);

      // 4. Unwrap private key
      // First, we need the IV that was used to wrap it.
      // Wait, in our schema, wrapped_private_key is returned by login.
      // Let's look at how the IV is stored.
      // In the register flow, we send wrapped_private_key. We can bundle the IV inside the wrapped_private_key!
      // In wrapPrivateKey, we returned { wrappedKey, iv }.
      // Wait, does the backend store the IV separately?
      // In backend/src/auth/mod.rs, RegisterRequest has:
      //   pub wrapped_private_key: String
      // If we send only `wrappedKey` to the backend, how do we get the `iv` back?
      // Ah! We can combine them into a single string in the frontend, e.g. "iv.wrappedKey" or "iv:wrappedKey"!
      // Let's check: in the backend, is `wrapped_private_key` just a string? Yes, `TEXT NOT NULL`.
      // If we combine them as `${ivBase64}:${wrappedKeyBase64}`, we can store BOTH in the database under `wrapped_private_key`!
      // Let's double check this! This is brilliant, because it requires ZERO database schema changes!
      // Let's see: in `wrapPrivateKey`, we return `{ wrappedKey, iv }`.
      // If we serialize it as `${iv}:${wrappedKey}`, then during login the frontend gets `${iv}:${wrappedKey}` back as `wrapped_private_key`.
      // We can then split it by `:` to get `iv` and `wrappedKey`!
      // Let's modify our logic to do this combined format. Let's see:
      // In registration, we combine: `const payloadWrappedKey = `${iv}:${wrappedKey}`;`
      // In login, we split:
      // `const [ivBase64, wrappedKeyBase64] = response.wrapped_private_key.split(":");`
      // This is extremely clean and works perfectly! Let's implement it!

      const wrappedPayload = response.wrapped_private_key;
      let ivBase64 = "";
      let wrappedKeyBase64 = "";

      if (wrappedPayload.includes(":")) {
        const parts = wrappedPayload.split(":");
        ivBase64 = parts[0];
        wrappedKeyBase64 = parts[1];
      } else {
        // Fallback for legacy setups
        throw new Error("Invalid wrapped private key format stored in database");
      }

      // 5. Unwrap private key using the derived KEK
      const decryptedPrivateKey = await unwrapPrivateKey(
        wrappedKeyBase64,
        ivBase64,
        KEK
      );

      // Cache IV in sessionStorage for refreshes
      sessionStorage.setItem("privault_pk_iv", ivBase64);

      const session: UserSession = {
        token: response.token,
        userId: response.user_id,
        username,
        wrappedPrivateKey: response.wrapped_private_key,
      };

      // 6. Save session info in localStorage (no raw keys!)
      localStorage.setItem("privault_session", JSON.stringify(session));

      setUser(session);
      setPrivateKey(decryptedPrivateKey);
      setLoading(false);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
    setPrivateKey(null);
    localStorage.removeItem("privault_session");
    sessionStorage.removeItem("privault_kek");
    sessionStorage.removeItem("privault_pk_iv");
    router.push("/login");
  };

  const enterSandbox = async () => {
    setLoading(true);
    setError(null);
    try {
      const keyPair = await generateRSAKeyPair();
      const session: UserSession = {
        token: "sandbox_mock_token",
        userId: "sandbox-user-id",
        username: "sandbox-visitor",
        wrappedPrivateKey: "sandbox-wrapped-key",
      };
      setUser(session);
      setPrivateKey(keyPair.privateKey);
      setLoading(false);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Failed to enter sandbox");
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        privateKey,
        loading,
        error,
        register,
        login,
        enterSandbox,
        logout,
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
