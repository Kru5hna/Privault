"use client";

import React, { useState, useEffect } from "react";
import {
  ActivityLogEntry,
  getActivityLogs,
  clearActivityLogs
} from "@/lib/activity";
import {
  History,
  Upload,
  Download,
  Eye,
  Link2,
  Trash2,
  RefreshCw,
  Calendar,
  XCircle,
  FileKey,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";

interface ActivityLogPanelProps {
  sessionToken: string;
}

export function ActivityLogPanel({ sessionToken }: ActivityLogPanelProps) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>("All");
  const [confirmClear, setConfirmClear] = useState(false);

  const loadLogs = React.useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const items = await getActivityLogs(sessionToken);
    setLogs(items);
    setLoading(false);
  }, [sessionToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadLogs]);

  const handleClearLogs = async () => {
    await clearActivityLogs(sessionToken);
    setLogs([]);
    setConfirmClear(false);
    toast.success("Activity logs cleared successfully");
  };

  const getIcon = (action: ActivityLogEntry["action"]) => {
    switch (action) {
      case "Upload":
        return <Upload size={14} className="text-blue-400" />;
      case "Download":
        return <Download size={14} className="text-green-400" />;
      case "Preview":
        return <Eye size={14} className="text-purple-400" />;
      case "Share created":
        return <Link2 size={14} className="text-amber-400" />;
      case "Share revoked":
        return <XCircle size={14} className="text-red-400" />;
      case "Restore":
        return <RefreshCw size={14} className="text-teal-400" />;
      case "Delete":
        return <Trash2 size={14} className="text-rose-500" />;
      default:
        return <FileKey size={14} className="text-white/40" />;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (selectedFilter === "All") return true;
    return log.action.toLowerCase() === selectedFilter.toLowerCase();
  });

  const formatTimestamp = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const filterOptions = [
    "All", "Upload", "Download", "Preview", "Share created", "Share revoked", "Restore", "Delete"
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 className="font-serif text-xl font-light text-white sm:text-2xl">
            Activity History
          </h2>
          <p className="text-xs text-[#8E929F] mt-1">
            Cryptographic operations and secure actions performed inside this vault session.
          </p>
        </div>

        {logs.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#E41613] hover:text-white border border-[#E41613]/30 hover:border-[#E41613] hover:bg-[#E41613]/5 px-4 py-2 transition-colors cursor-pointer rounded"
          >
            Clear History
          </button>
        )}
      </div>

      {/* Filter Options */}
      <div className="flex flex-wrap gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => setSelectedFilter(opt)}
            className={`px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase border rounded transition-colors cursor-pointer ${
              selectedFilter === opt
                ? "bg-[#E41613]/10 border-[#E41613] text-white"
                : "bg-[#111215] border-white/5 text-[#8E929F] hover:border-white/20 hover:text-white"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="py-20 text-center border border-dashed border-white/5 bg-[#111215] p-6 rounded flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#E41613] animate-spin" />
          <span className="text-xs tracking-widest uppercase text-white/30">
            Loading activity history...
          </span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-white/5 bg-[#111215] p-6 rounded flex flex-col items-center justify-center gap-3">
          <History className="w-12 h-12 text-[#5E626F] opacity-40 animate-pulse" />
          <span className="text-xs tracking-widest uppercase text-white/30">
            No activity matches the filter
          </span>
        </div>
      ) : (
        <div className="relative border-l border-white/5 pl-6 ml-3 space-y-6">
          {filteredLogs.map((log) => (
            <div key={log.id} className="relative group">
              {/* Timeline Indicator Node */}
              <span className="absolute -left-[31px] top-1 bg-[#15161A] border border-white/10 p-1.5 rounded-full flex items-center justify-center transition-all duration-300 group-hover:border-[#E41613]/40 group-hover:scale-110">
                {getIcon(log.action)}
              </span>

              {/* Log Entry Box */}
              <div className="bg-[#111215] border border-white/5 hover:border-white/10 p-4 transition-all duration-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    {log.action}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-white/40 font-mono">
                    <Calendar size={10} />
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-[#8E929F] mt-2 font-mono break-all leading-relaxed">
                  {log.details}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal: Clear Logs */}
      <Modal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        size="sm"
        zIndex={160}
        showCloseButton={false}
        data-testid="clear-logs-confirm-modal"
      >
        <div className="w-full max-w-sm bg-[#111215] border border-red-500/20 p-6 rounded text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
            <History size={24} />
          </div>
          <h3 className="font-serif text-base font-bold text-white mb-2 uppercase tracking-wide">
            Clear Logs
          </h3>
          <p className="text-xs text-[#8E929F] mb-6 leading-relaxed">
            Are you sure you want to clear your activity history? This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleClearLogs}
              className="flex-1 py-2.5 bg-[#E41613] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer"
            >
              Clear History
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="flex-1 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider rounded transition-colors cursor-pointer hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
