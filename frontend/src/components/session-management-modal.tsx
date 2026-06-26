"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Smartphone, Monitor, AlertTriangle } from "lucide-react";
import {
  apiGetSessions,
  apiRevokeSession,
  apiRevokeAllSessions,
  SessionInfo,
} from "@/lib/api";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

interface SessionManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionToken: string;
}

function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown" };

  let browser = "Unknown";
  let os = "Unknown";

  if (ua.includes("Firefox") && !ua.includes("Seamonkey")) browser = "Firefox";
  else if (ua.includes("Chrome") && !ua.includes("Edg") && !ua.includes("OPR")) browser = "Chrome";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";

  if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("CrOS")) os = "ChromeOS";

  return { browser, os };
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function SessionManagementModal({
  isOpen,
  onClose,
  sessionToken,
}: SessionManagementModalProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetSessions(sessionToken);
      setSessions(data);
    } catch (err: unknown) {
      toast.error(`Failed to load sessions: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (isOpen) loadSessions();
  }, [isOpen, loadSessions]);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await apiRevokeSession(sessionToken, id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      toast.success("Session revoked");
    } catch (err: unknown) {
      toast.error(`Failed to revoke: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const result = await apiRevokeAllSessions(sessionToken);
      setSessions((prev) => prev.filter((s) => s.is_current));
      toast.success(result.message || "Other sessions revoked");
    } catch (err: unknown) {
      toast.error(`Failed to revoke: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setRevokingAll(false);
    }
  };

  if (!isOpen) return null;

  const otherCount = sessions.filter((s) => !s.is_current).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      zIndex={150}
      data-testid="session-management-modal"
    >
      <div className="w-full h-auto max-w-xl bg-[#111215] border border-white/10 p-6 sm:p-8 rounded relative shadow-2xl font-sans max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4 pr-8">
          <Smartphone size={20} className="text-[#E41613]" />
          <h2 className="font-serif text-lg font-bold text-white uppercase tracking-wider">
            Session Management
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#E41613] border-t-transparent" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-white/50">No active sessions found.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
            <div className="space-y-2">
              {sessions.map((s) => {
                const { browser, os } = parseUserAgent(s.user_agent);
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-3 border px-4 py-3 text-xs transition-colors ${
                      s.is_current
                        ? "border-[#E41613]/30 bg-[#E41613]/5"
                        : "border-white/5 bg-[#15161A]/40 hover:bg-[#1E2026]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="shrink-0 text-white/40">
                        {os === "iOS" || os === "Android" ? (
                          <Smartphone size={16} />
                        ) : (
                          <Monitor size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white truncate">
                            {browser}
                          </span>
                          <span className="text-white/30">on</span>
                          <span className="text-white/70">{os}</span>
                          {s.is_current && (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#E41613] border border-[#E41613]/30 px-1.5 py-0.5">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-white/40">
                          <span>{s.ip_address || "Unknown IP"}</span>
                          <span>{relativeTime(s.created_at)}</span>
                        </div>
                      </div>
                    </div>
                    {!s.is_current && (
                      <button
                        onClick={() => handleRevoke(s.id)}
                        disabled={revokingId === s.id}
                        className="shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/50 border border-white/10 hover:border-[#E41613] hover:text-[#E41613] transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {revokingId === s.id ? "..." : "Revoke"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {otherCount > 0 && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <button
              onClick={handleRevokeAll}
              disabled={revokingAll || loading}
              className="flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-40"
            >
              <AlertTriangle size={14} />
              {revokingAll
                ? "Revoking..."
                : `Revoke ${otherCount} other session${otherCount > 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-white/5">
          <button
            onClick={onClose}
            className="py-2 px-4 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded-sm transition-colors hover:bg-white/10 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
