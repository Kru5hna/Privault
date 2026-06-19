import React, { useState, useEffect } from "react";
import { 
  DocumentMetadata, 
  UserSession, 
  ShareLinkMetadata, 
  apiCreateShareLink, 
  apiListMyShareLinks, 
  apiRevokeShareLink 
} from "@/lib/api";
import { encryptDekForSharing, decryptOwnerLinkKey } from "@/lib/crypto";
import { 
  X, 
  Copy, 
  Check, 
  Calendar, 
  Trash2, 
  Link, 
  Loader2 
} from "lucide-react";
import { toast } from "sonner";

interface ShareModalProps {
  doc: DocumentMetadata | null;
  isOpen: boolean;
  onClose: () => void;
  user: UserSession | null;
  privateKey: CryptoKey | null;
}

export function ShareModal({
  doc,
  isOpen,
  onClose,
  user,
  privateKey,
}: ShareModalProps) {
  const [expiryPreset, setExpiryPreset] = useState<string>("24h");
  const [downloadLimit, setDownloadLimit] = useState<string>("");
  const [isUnlimited, setIsUnlimited] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [generatedLink, setGeneratedLink] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [activeShares, setActiveShares] = useState<ShareLinkMetadata[]>([]);
  const [loadingShares, setLoadingShares] = useState<boolean>(false);

  // Load existing share links for this document
  const loadExistingShares = React.useCallback(async () => {
    if (!user || !doc) return;
    setLoadingShares(true);
    try {
      const shares = await apiListMyShareLinks(user.sessionToken);
      const docShares = shares.filter(s => s.document_id === doc.id);
      setActiveShares(docShares);
    } catch (err: unknown) {
      console.error("Failed to load share links", err);
    } finally {
      setLoadingShares(false);
    }
  }, [user, doc]);

  useEffect(() => {
    if (isOpen && doc && user) {
      setTimeout(() => {
        setGeneratedLink("");
        setCopied(false);
        loadExistingShares();
      }, 0);
    }
  }, [isOpen, doc, user, loadExistingShares]);

  if (!isOpen || !doc || !user) return null;

  const calculateExpiry = (): string | null => {
    const now = Date.now();
    switch (expiryPreset) {
      case "1h":
        return new Date(now + 60 * 60 * 1000).toISOString();
      case "24h":
        return new Date(now + 24 * 60 * 60 * 1000).toISOString();
      case "7d":
        return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      case "30d":
        return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      case "never":
      default:
        return null;
    }
  };

  const handleGenerateLink = async () => {
    if (!privateKey) {
      toast.error("Cryptographic key context missing.");
      return;
    }
    setGenerating(true);
    try {
      // 1. Re-encrypt the DEK with a random symmetric Link Key in the browser
      const { linkKey, reEncryptedDek, ownerEncryptedLinkKey } = await encryptDekForSharing(
        doc.encrypted_dek,
        privateKey
      );

      // 2. Compute parameters
      const expiresAt = calculateExpiry();
      const limit = isUnlimited ? null : parseInt(downloadLimit) || null;

      // 3. Create share link on backend
      const share = await apiCreateShareLink(
        user.sessionToken,
        doc.id,
        reEncryptedDek,
        expiresAt,
        limit,
        ownerEncryptedLinkKey
      );

      // 4. Construct URL with Link Key in the hash fragment (never sent to server!)
      const origin = window.location.origin;
      const shareUrl = `${origin}/share/${share.id}#${linkKey}`;
      setGeneratedLink(shareUrl);
      toast.success("Cryptographic share link generated!");
      
      // Reload list
      loadExistingShares();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Link generation failed: ${errorMsg}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await apiRevokeShareLink(user.sessionToken, shareId);
      toast.success("Share link revoked");
      loadExistingShares();
      if (generatedLink.includes(shareId)) {
        setGeneratedLink("");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Revoke failed: ${errorMsg}`);
    }
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return "Never";
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-[#111215] border border-[#1E2026] text-[#F5F5F0] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-[#1E2026]">
          <div className="flex items-center gap-2">
            <Link size={16} className="text-[#E41613]" />
            <span className="text-xs font-bold tracking-[0.2em] text-white">SHARE DOCUMENT</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#8E929F] hover:text-white transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* File summary */}
          <div className="bg-[#15161A] p-4 border border-white/5">
            <span className="block text-[10px] font-bold text-[#5E626F] tracking-widest uppercase">Target File</span>
            <span className="block text-sm font-semibold mt-1 break-all">{doc.name}</span>
          </div>

          {/* Settings form */}
          {!generatedLink && (
            <div className="space-y-4">
              {/* Expiry presets */}
              <div>
                <label className="block text-[10px] font-bold text-[#8E929F] tracking-widest uppercase mb-2">
                  Link Expiration
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { value: "1h", label: "1 HR" },
                    { value: "24h", label: "24 HR" },
                    { value: "7d", label: "7 DAYS" },
                    { value: "30d", label: "30 DAYS" },
                    { value: "never", label: "NEVER" },
                  ].map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setExpiryPreset(p.value)}
                      className={`py-2 text-[10px] font-bold tracking-wider transition-colors border cursor-pointer ${
                        expiryPreset === p.value
                          ? "bg-[#E41613]/10 border-[#E41613] text-white"
                          : "bg-[#15161A] border-white/5 text-[#8E929F] hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Download limits */}
              <div>
                <label className="block text-[10px] font-bold text-[#8E929F] tracking-widest uppercase mb-2">
                  Download Limit
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <input
                      type="number"
                      disabled={isUnlimited}
                      min="1"
                      placeholder="Enter max downloads..."
                      value={downloadLimit}
                      onChange={(e) => setDownloadLimit(e.target.value)}
                      className={`w-full input-tactical py-2 text-xs font-semibold tracking-wider ${
                        isUnlimited ? "opacity-30 cursor-not-allowed" : ""
                      }`}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none text-[#8E929F] hover:text-white">
                    <input
                      type="checkbox"
                      checked={isUnlimited}
                      onChange={(e) => setIsUnlimited(e.target.checked)}
                      className="accent-[#E41613] cursor-pointer"
                    />
                    <span>UNLIMITED</span>
                  </label>
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerateLink}
                disabled={generating}
                className="w-full btn-primary py-3 cursor-pointer"
              >
                <span className="btn-bg"></span>
                <span className="btn-text flex items-center justify-center gap-2">
                  {generating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      GENERATING CRYPTO LINK...
                    </>
                  ) : (
                    "GENERATE CRYPTOGRAPHIC SHARE LINK"
                  )}
                </span>
              </button>
            </div>
          )}

          {/* Generated link display */}
          {generatedLink && (
            <div className="space-y-3 bg-[#E41613]/5 border border-[#E41613]/20 p-4 animate-in fade-in duration-300">
              <span className="block text-[10px] font-bold text-[#E41613] tracking-widest uppercase">
                Generated Link (Link Key included in hash # fragment)
              </span>
              <p className="text-[11px] text-[#8E929F] tracking-wide leading-relaxed">
                <strong className="text-white">Important security notice:</strong> The decryption key is embedded in the hash fragment (after the # symbol). Browsers never send this fragment to the server, preserving zero-knowledge security. Keep this link safe!
              </p>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="flex-1 bg-[#15161A] text-xs font-mono px-3 py-2 border border-white/5 select-all focus:outline-none focus:border-[#E41613]"
                />
                <button
                  onClick={handleCopyLink}
                  className="p-2 border border-[#E41613]/30 bg-[#E41613]/10 hover:bg-[#E41613]/20 text-[#E41613] hover:text-white transition-colors cursor-pointer"
                  title="Copy Link"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <button
                onClick={() => setGeneratedLink("")}
                className="text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest block pt-2"
              >
                Generate another with different limits
              </button>
            </div>
          )}

          {/* Active share links */}
          <div className="border-t border-[#1E2026] pt-6">
            <span className="block text-[10px] font-bold text-[#5E626F] tracking-widest uppercase mb-3">
              ACTIVE SHARE LINKS
            </span>
            {loadingShares ? (
              <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-[#8E929F]" />
              </div>
            ) : activeShares.length === 0 ? (
              <div className="text-xs text-[#5E626F] italic py-2">
                No active share links for this document.
              </div>
            ) : (
              <div className="space-y-2">
                {activeShares.map((s) => (
                  <div 
                    key={s.id} 
                    className="flex items-center justify-between bg-[#15161A] border border-white/5 p-3 rounded text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-white/50">ID: {s.id.substring(0, 8)}...</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-[#8E929F]">
                          Downloads: {s.downloads_count} / {s.download_limit !== null ? s.download_limit : "∞"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[#8E929F]">
                        <Calendar size={10} />
                        <span>Expires: {formatDate(s.expires_at)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {s.owner_encrypted_link_key ? (
                        <button
                          onClick={async () => {
                            if (!privateKey) return;
                            try {
                              const decryptedKey = await decryptOwnerLinkKey(s.owner_encrypted_link_key!, privateKey);
                              const origin = window.location.origin;
                              const shareUrl = `${origin}/share/${s.id}#${decryptedKey}`;
                              navigator.clipboard.writeText(shareUrl);
                              toast.success("Share link copied to clipboard");
                            } catch (err) {
                              console.error(err);
                              toast.error("Failed to decrypt share link key.");
                            }
                          }}
                          className="p-1.5 rounded text-[#8E929F] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                          title="Copy Share Link"
                        >
                          <Copy size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            toast.warning("This link was generated under an older version and cannot be recovered. Please revoke it and create a new link.");
                          }}
                          className="p-1.5 rounded text-white/20 cursor-not-allowed"
                          title="Legacy link: key unrecoverable"
                        >
                          <Copy size={14} className="opacity-20" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRevoke(s.id)}
                        className="p-1.5 rounded text-[#8E929F] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Revoke Share"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 flex items-center justify-end px-6 border-t border-[#1E2026] bg-[#15161A]/50">
          <button
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-widest text-[#8E929F] hover:text-white cursor-pointer px-4"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
