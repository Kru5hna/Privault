"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  apiGetShareLink,
  apiDownloadSharedDocument,
  ShareLinkMetadata,
} from "@/lib/api";
import { decryptDekWithLinkKey } from "@/lib/crypto";
import {
  Download,
  Shield,
  Clock,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Lock,
  Loader2,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";

type PageStatus =
  | "loading"
  | "ready"
  | "decrypting"
  | "previewing"
  | "complete"
  | "error";

// ── Static Helper Functions (Moved outside component to satisfy rules and optimize) ──
const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
};

const getFileIcon = (filename: string) => {
  const ext = getFileExtension(filename);
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
  if (imageExts.includes(ext)) return <ImageIcon size={32} />;
  return <FileText size={32} />;
};

const getMimeType = (filename: string): string => {
  const ext = getFileExtension(filename);
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    xml: "text/xml",
  };
  return mimeMap[ext] || "application/octet-stream";
};

const isPreviewable = (filename: string): boolean => {
  const ext = getFileExtension(filename);
  const previewableExts = [
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
    "pdf", "txt", "md", "json", "csv",
  ];
  return previewableExts.includes(ext);
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatExpiry = (expiresAt: string | null): string => {
  if (!expiresAt) return "Never";
  const d = new Date(expiresAt);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
};

export default function ShareLandingPage() {
  const params = useParams();
  const shareId = params.id as string;

  const [status, setStatus] = useState<PageStatus>("loading");
  const [error, setError] = useState<string>("");
  const [shareMeta, setShareMeta] = useState<ShareLinkMetadata | null>(null);
  const [linkKey, setLinkKey] = useState<string>(""); // Avoid empty space issues
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>("");

  // Extract the Link Key from the hash fragment on mount safely
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      const extracted = hash.substring(1);
      setTimeout(() => {
        setLinkKey(extracted);
      }, 0);
    }
  }, [setLinkKey]);

  // Fetch share metadata once we have the shareId
  useEffect(() => {
    if (!shareId) return;

    async function loadShareMeta() {
      try {
        const meta = await apiGetShareLink(shareId);
        setShareMeta(meta);
        setStatus("ready");
      } catch (err: unknown) {
        const errorObject = err as Error;
        const msg = errorObject?.message || "Failed to load share link.";
        if (msg.includes("expired")) {
          setError("This share link has expired.");
        } else if (msg.includes("limit")) {
          setError("Download limit reached for this share link.");
        } else if (msg.includes("not found") || msg.includes("404")) {
          setError("Share link not found or has been revoked.");
        } else {
          setError(msg);
        }
        setStatus("error");
      }
    }

    loadShareMeta();
  }, [shareId]);

  const handleDecryptAndDownload = useCallback(async () => {
    if (!shareMeta || !linkKey) {
      setError("Missing decryption key. The link may be incomplete.");
      setStatus("error");
      return;
    }

    setStatus("decrypting");
    try {
      // 1. Decrypt the DEK using the Link Key from the URL fragment
      const dek = await decryptDekWithLinkKey(
        shareMeta.encrypted_dek,
        linkKey
      );

      // 2. Download the raw ciphertext from the server
      const ciphertext = await apiDownloadSharedDocument(shareId);

      // 3. Decrypt the file in the browser
      const iv = ciphertext.slice(0, 12);
      const encryptedPayload = ciphertext.slice(12);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        dek,
        encryptedPayload as BufferSource
      );

      const decryptedBytes = new Uint8Array(decryptedBuffer);

      // 4. Trigger browser download
      const mimeType = getMimeType(shareMeta.document_name);
      const blob = new Blob([decryptedBytes as unknown as BlobPart], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const linkElement = document.createElement("a");
      linkElement.href = url;
      linkElement.setAttribute("download", shareMeta.document_name);
      document.body.appendChild(linkElement);
      linkElement.click();
      linkElement.parentNode?.removeChild(linkElement);
      window.URL.revokeObjectURL(url);

      setStatus("complete");
    } catch (err: unknown) {
      console.error("Decryption failed:", err);
      const errorObject = err as Error;
      if (errorObject?.message?.includes("decrypt")) {
        setError("Decryption failed. The link key may be invalid or corrupted.");
      } else {
        setError(errorObject?.message || "Failed to decrypt and download the file.");
      }
      setStatus("error");
    }
  }, [shareMeta, linkKey, shareId]);

  const handlePreview = useCallback(async () => {
    if (!shareMeta || !linkKey) return;

    setStatus("decrypting");
    try {
      const dek = await decryptDekWithLinkKey(
        shareMeta.encrypted_dek,
        linkKey
      );

      const ciphertext = await apiDownloadSharedDocument(shareId);

      const iv = ciphertext.slice(0, 12);
      const encryptedPayload = ciphertext.slice(12);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        dek,
        encryptedPayload as BufferSource
      );

      const decryptedBytes = new Uint8Array(decryptedBuffer);
      const mimeType = getMimeType(shareMeta.document_name);
      const blob = new Blob([decryptedBytes as unknown as BlobPart], { type: mimeType });
      const url = window.URL.createObjectURL(blob);

      setPreviewUrl(url);
      setPreviewType(mimeType);
      setStatus("previewing");
    } catch (err: unknown) {
      console.error("Preview failed:", err);
      const errorObject = err as Error;
      setError(errorObject?.message || "Failed to preview the file.");
      setStatus("error");
    }
  }, [shareMeta, linkKey, shareId]);

  // ── Error State ──
  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        <div className="relative z-10 w-full max-w-md mx-4">
          <div className="bg-[#111215] border border-red-500/20 p-8 text-center">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 mb-6">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-wider uppercase mb-3">
              Access Denied
            </h1>
            <p className="text-sm text-[#8E929F] leading-relaxed mb-6">
              {error}
            </p>
            <Link
              href="/"
              className="inline-block text-xs font-bold uppercase tracking-widest text-[#E41613] hover:text-white border border-[#E41613]/30 hover:border-[#E41613] px-6 py-2.5 transition-colors"
            >
              Go to Privault
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading State ──
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        <div className="relative z-10 text-center">
          <Loader2 size={24} className="animate-spin text-[#E41613] mx-auto mb-4" />
          <span className="text-xs font-bold tracking-[0.25em] text-white/50 uppercase">
            Loading Secure Share Link...
          </span>
        </div>
      </div>
    );
  }

  // ── Decrypting State ──
  if (status === "decrypting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        <div className="relative z-10 text-center max-w-sm mx-4">
          <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-6 animate-pulse">
            <Lock size={32} className="text-[#E41613]" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-wider uppercase mb-2">
            Decrypting...
          </h2>
          <p className="text-xs text-[#8E929F] tracking-wider">
            Your file is being decrypted in the browser using the embedded key.
            <br />
            <span className="text-[#E41613]">The server never sees the plaintext.</span>
          </p>
        </div>
      </div>
    );
  }

  // ── Complete State ──
  if (status === "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        <div className="relative z-10 w-full max-w-md mx-4 text-center">
          <div className="bg-[#111215] border border-green-500/20 p-8">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-wider uppercase mb-3">
              Download Complete
            </h1>
            <p className="text-sm text-[#8E929F] leading-relaxed mb-2">
              <span className="text-white font-semibold">{shareMeta?.document_name}</span> has been
              decrypted and downloaded successfully.
            </p>
            <p className="text-xs text-[#5E626F] mb-6">
              The file was decrypted entirely in your browser. No plaintext data
              was transmitted to the server.
            </p>
            <button
              onClick={() => setStatus("ready")}
              className="text-xs font-bold uppercase tracking-widest text-[#8E929F] hover:text-white transition-colors cursor-pointer"
            >
              Download Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview State ──
  if (status === "previewing" && previewUrl) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        {/* Preview Header */}
        <header className="relative z-10 border-b border-white/5 bg-[#15161A]/80 backdrop-blur-xl px-6 py-4">
          <div className="mx-auto max-w-5xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-[#E41613]" />
              <span className="font-serif text-lg font-bold tracking-[0.2em] text-white">
                PRIVAULT
              </span>
              <span className="text-xs text-white/40 uppercase tracking-wider">
                / Preview
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDecryptAndDownload}
                className="btn-primary py-2 px-4 cursor-pointer text-xs"
              >
                <span className="btn-bg"></span>
                <span className="btn-text flex items-center gap-2">
                  <Download size={14} /> DOWNLOAD
                </span>
              </button>
              <button
                onClick={() => {
                  if (previewUrl) window.URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setStatus("ready");
                }}
                className="text-xs font-bold uppercase tracking-widest text-[#8E929F] hover:text-white transition-colors cursor-pointer px-3 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </header>

        {/* Preview Content */}
        <main className="relative z-10 flex-1 flex items-center justify-center p-6">
          {previewType.startsWith("image/") ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewUrl}
              alt={shareMeta?.document_name}
              className="max-w-full max-h-[80vh] object-contain rounded border border-white/5"
            />
          ) : previewType === "application/pdf" ? (
            <iframe
              src={previewUrl}
              className="w-full max-w-4xl h-[80vh] border border-white/5 rounded bg-white"
              title="PDF Preview"
            />
          ) : previewType.startsWith("text/") || previewType === "application/json" ? (
            <TextPreview url={previewUrl} />
          ) : (
            <div className="text-center text-sm text-white/40">
              Preview not available for this file type.
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── Ready State — Main Landing ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0D0E10] text-[#F5F5F0] dotted-grid-dark relative">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield size={20} className="text-[#E41613]" />
            <span className="font-serif text-xl font-bold tracking-[0.25em] text-white">
              PRIVAULT
            </span>
          </div>
          <p className="text-xs text-[#8E929F] tracking-wider uppercase">
            End-to-End Encrypted File Sharing
          </p>
        </div>

        {/* Share Card */}
        <div className="bg-[#111215] border border-[#1E2026]">
          {/* File Info Section */}
          <div className="p-6 border-b border-[#1E2026]">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#E41613]/10 border border-[#E41613]/20 text-[#E41613]">
                {shareMeta && getFileIcon(shareMeta.document_name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-white break-all leading-tight">
                  {shareMeta?.document_name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#8E929F]">
                  <span className="font-mono">
                    {shareMeta ? formatSize(shareMeta.document_size) : "—"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {shareMeta ? formatExpiry(shareMeta.expires_at) : "—"}
                  </span>
                  {shareMeta && shareMeta.download_limit !== null && (
                    <span className="flex items-center gap-1">
                      <Download size={12} />
                      {shareMeta.downloads_count} / {shareMeta.download_limit} downloads
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="px-6 py-4 bg-[#15161A]/50 border-b border-[#1E2026]">
            <div className="flex items-start gap-3">
              <Lock size={14} className="text-[#E41613] mt-0.5 shrink-0" />
              <div>
                <span className="block text-[10px] font-bold text-[#E41613] tracking-widest uppercase mb-1">
                  Zero-Knowledge Decryption
                </span>
                <p className="text-[11px] text-[#8E929F] leading-relaxed">
                  This file is encrypted with AES-256-GCM. The decryption key is embedded in the
                  URL fragment (<code className="text-white/60">#</code>) and is{" "}
                  <strong className="text-white">never sent to the server</strong>. Decryption
                  happens entirely in your browser.
                </p>
              </div>
            </div>
          </div>

          {/* No Link Key Warning */}
          {!linkKey && (
            <div className="px-6 py-4 bg-amber-500/5 border-b border-amber-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-400 leading-relaxed">
                  <strong>Missing decryption key.</strong> The URL appears to be
                  incomplete — the hash fragment containing the Link Key is missing.
                  Please ensure you copied the full URL including the <code>#</code> portion.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-6 space-y-3">
            <button
              onClick={handleDecryptAndDownload}
              disabled={!linkKey}
              className={`w-full btn-primary py-3.5 cursor-pointer ${
                !linkKey ? "opacity-40 cursor-not-allowed" : ""
              }`}
            >
              <span className="btn-bg"></span>
              <span className="btn-text flex items-center justify-center gap-2 text-sm">
                <Download size={16} />
                DECRYPT & DOWNLOAD
              </span>
            </button>

            {shareMeta && isPreviewable(shareMeta.document_name) && linkKey && (
              <button
                onClick={handlePreview}
                className="w-full py-3 text-xs font-bold uppercase tracking-widest text-[#8E929F] hover:text-white border border-white/10 hover:border-white/20 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Eye size={14} />
                Preview in Browser
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-xs text-[#5E626F] hover:text-[#E41613] transition-colors tracking-wider"
          >
            Powered by PRIVAULT — Zero-Knowledge E2EE File Storage
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Text/JSON/CSV Preview Sub-component ──
function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then((t) => {
        setText(t);
        setLoading(false);
      })
      .catch(() => {
        setText("Failed to load text preview.");
        setLoading(false);
      });
  }, [url]);

  if (loading) {
    return (
      <div className="text-xs text-white/30 animate-pulse">Loading preview...</div>
    );
  }

  return (
    <pre className="w-full max-w-4xl max-h-[80vh] overflow-auto bg-[#111215] border border-white/5 p-6 text-xs font-mono text-white/80 whitespace-pre-wrap break-words custom-scrollbar">
      {text}
    </pre>
  );
}
