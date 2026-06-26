"use client";

import React, { useEffect, useState } from "react";
import {
  UserSession,
  ShareLinkMetadata,
  apiListMyShareLinks,
  apiRevokeShareLink,
} from "@/lib/api";
import {
  Link,
  Copy,
  Check,
  Trash2,
  Clock,
  Download,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";

interface SharedLinksPanelProps {
  user: UserSession | null;
}

export function SharedLinksPanel({ user }: SharedLinksPanelProps) {
  const [shares, setShares] = useState<ShareLinkMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadShares = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiListMyShareLinks(user.sessionToken);
      setShares(data);
    } catch (err: unknown) {
      console.error("Failed to load shared links:", err);
      toast.error("Failed to load shared links.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setTimeout(() => {
      loadShares();
    }, 0);
  }, [loadShares]);

  const handleCopyLink = (shareId: string) => {
    const origin = window.location.origin;
    // Note: we can't reconstruct the full link with the key since the key is only
    // known at creation time. We copy the base link without the hash fragment.
    const url = `${origin}/share/${shareId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(shareId);
    toast.info("Link copied (without decryption key — the key was only shown at creation time)");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (shareId: string) => {
    if (!user) return;
    try {
      const target = shares.find((s) => s.id === shareId);
      await apiRevokeShareLink(user.sessionToken, shareId);
      toast.success("Share link revoked successfully.");
      logActivity(
        user.userId,
        "Share revoked",
        `Revoked share link for: ${target?.document_name ?? shareId}`
      );
      loadShares();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to revoke: ${errorMsg}`);
    }
  };

  const formatDate = (isoStr: string | null): string => {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatExpiry = (expiresAt: string | null): { text: string; isExpired: boolean } => {
    if (!expiresAt) return { text: "Never", isExpired: false };
    const d = new Date(expiresAt);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff <= 0) return { text: "Expired", isExpired: true };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 24) return { text: `${Math.floor(hours / 24)}d ${hours % 24}h left`, isExpired: false };
    if (hours > 0) return { text: `${hours}h left`, isExpired: false };
    const minutes = Math.floor(diff / (1000 * 60));
    return { text: `${minutes}m left`, isExpired: false };
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const isLimitReached = (share: ShareLinkMetadata): boolean => {
    if (share.download_limit === null) return false;
    return share.downloads_count >= share.download_limit;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-light tracking-wide text-white sm:text-3xl">
            Shared Links
          </h1>
          <p className="text-xs text-white/40 tracking-wider mt-1">
            Manage your active cryptographic share links
          </p>
        </div>
        <button
          onClick={loadShares}
          className="text-xs font-bold uppercase tracking-widest text-[#8E929F] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 transition-colors cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      <div className="panel-card">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3">
            <Loader2 size={20} className="animate-spin text-[#E41613]" />
            <span className="text-xs tracking-widest uppercase text-white/30">
              Loading shared links...
            </span>
          </div>
        ) : shares.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center bg-white/5 border border-white/10 text-white/20">
              <Link size={24} />
            </div>
            <div>
              <p className="text-sm text-white/50 font-medium">No shared links yet</p>
              <p className="text-xs text-white/30 mt-1">
                Share a document from your vault to create your first link.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {shares.map((share) => {
              const expiry = formatExpiry(share.expires_at);
              const limitReached = isLimitReached(share);
              const isInactive = expiry.isExpired || limitReached;

              return (
                <div
                  key={share.id}
                  className={`p-4 sm:p-6 transition-colors ${
                    isInactive ? "opacity-50" : "hover:bg-white/[0.01]"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm font-semibold text-white break-all leading-tight">
                          {share.document_name}
                        </span>
                        {isInactive && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                            {expiry.isExpired ? "Expired" : "Limit Reached"}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8E929F]">
                        <span className="font-mono">{formatSize(share.document_size)}</span>
                        <span className="font-mono text-white/30">
                          ID: {share.id.substring(0, 8)}...
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-[#5E626F]" />
                          <span className={expiry.isExpired ? "text-red-400" : "text-[#8E929F]"}>
                            {expiry.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Download size={12} className="text-[#5E626F]" />
                          <span className={limitReached ? "text-red-400" : "text-[#8E929F]"}>
                            {share.downloads_count}
                            {share.download_limit !== null
                              ? ` / ${share.download_limit}`
                              : ""}{" "}
                            downloads
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#5E626F]">
                          <span>Created: {formatDate(share.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCopyLink(share.id)}
                        className="p-2 border border-white/10 hover:border-white/20 text-[#8E929F] hover:text-white bg-white/[0.02] hover:bg-white/5 transition-colors cursor-pointer"
                        title="Copy share link (without decryption key)"
                      >
                        {copiedId === share.id ? (
                          <Check size={14} className="text-green-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <a
                        href={`/share/${share.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 border border-white/10 hover:border-white/20 text-[#8E929F] hover:text-white bg-white/[0.02] hover:bg-white/5 transition-colors cursor-pointer inline-flex"
                        title="Open share page"
                      >
                        <ExternalLink size={14} />
                      </a>
                      <button
                        onClick={() => handleRevoke(share.id)}
                        className="p-2 border border-red-500/20 hover:border-red-500/40 text-[#8E929F] hover:text-red-400 bg-red-500/[0.02] hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Revoke share link"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security Notice */}
      {shares.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 p-4">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-400/70 leading-relaxed">
            <strong className="text-amber-400">Note:</strong> The decryption key is only
            included in the share link at creation time. Copying from this panel copies the
            link <em>without</em> the key. To share a file securely, generate a new share
            link from the document&apos;s Share modal.
          </p>
        </div>
      )}
    </div>
  );
}
