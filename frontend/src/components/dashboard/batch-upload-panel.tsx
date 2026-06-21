"use client";

import React from "react";
import {
  ChevronUp,
  ChevronDown,
  X,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface BatchUploadState {
  name: string;
  size: number;
  state: "encrypting" | "uploading" | "complete" | "failed";
  error?: string;
}

interface BatchUploadPanelProps {
  uploads: Record<string, BatchUploadState>;
  minimized: boolean;
  onToggleMinimize: () => void;
  onDismiss: () => void;
}

export const BatchUploadPanel = React.memo(function BatchUploadPanel({
  uploads,
  minimized,
  onToggleMinimize,
  onDismiss,
}: BatchUploadPanelProps) {
  const entries = Object.values(uploads);
  const completed = entries.filter((u) => u.state === "complete").length;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-[#111215] border border-white/10 shadow-2xl transition-all duration-300 font-sans">
      <div className="flex items-center justify-between px-4 py-3 bg-[#15161A] border-b border-white/10">
        <span className="text-xs font-bold tracking-widest text-white uppercase">
          Uploads ({completed}/{entries.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMinimize}
            className="text-[#8E929F] hover:text-white p-1 transition-colors cursor-pointer"
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onDismiss}
            className="text-[#8E929F] hover:text-red-500 p-1 transition-colors cursor-pointer"
            title="Dismiss panel"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="max-h-60 overflow-y-auto divide-y divide-white/5 custom-scrollbar">
          {entries.map((upload) => (
            <div key={upload.name} className="p-3 flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate" title={upload.name}>
                  {upload.name}
                </p>
                <p className="text-[10px] text-[#8E929F] mt-0.5">
                  {upload.size < 1024
                    ? `${upload.size} B`
                    : `${(upload.size / 1024).toFixed(1)} KB`}{" "}
                  • {upload.state}
                </p>
                {upload.error && (
                  <p className="text-[9px] text-[#E41613] mt-1 break-words font-mono">
                    {upload.error}
                  </p>
                )}
              </div>
              <div className="shrink-0 mt-0.5">
                {upload.state === "encrypting" && (
                  <Lock size={14} className="text-amber-500 animate-pulse" />
                )}
                {upload.state === "uploading" && (
                  <div className="h-3 w-3 border-2 border-[#E41613] border-t-transparent rounded-full animate-spin" />
                )}
                {upload.state === "complete" && (
                  <CheckCircle2 size={14} className="text-green-500" />
                )}
                {upload.state === "failed" && (
                  <AlertTriangle size={14} className="text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
