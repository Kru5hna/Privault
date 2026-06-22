"use client";

import React, { Suspense, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2, ShieldCheck, X, ChevronLeft, ChevronRight } from "lucide-react";

const AdvancedViewer = dynamic(
  () => import("./advanced-viewer").then((mod) => ({ default: mod.AdvancedViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center gap-3 py-16">
        <Loader2 size={24} className="animate-spin text-[#E41613]" />
        <span className="text-xs tracking-widest uppercase text-white/30 font-bold">
          LOADING VIEWER...
        </span>
      </div>
    ),
  }
);

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileBytes: Uint8Array | null;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export function FilePreviewModal({ isOpen, onClose, fileName, fileBytes, onPrev, onNext, hasPrev, hasNext }: FilePreviewModalProps) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    mp4: "video/mp4",
    webm: "video/webm",
    ogg: "video/ogg",
    mov: "video/mp4",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    xml: "text/xml",
    js: "text/javascript",
    ts: "text/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    rs: "text/rust",
    py: "text/python",
    css: "text/css",
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";

  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowLeft" && hasPrev && onPrev) {
      e.preventDefault();
      onPrev();
    } else if (e.key === "ArrowRight" && hasNext && onNext) {
      e.preventDefault();
      onNext();
    }
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md">
      <div className="w-full h-full max-w-6xl flex flex-col bg-[#15161A] border border-white/10 rounded overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 shrink-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-[#E41613]" />
            <span className="font-mono text-sm text-white font-bold">{fileName}</span>
            {fileBytes && (
              <span className="text-[9px] font-bold tracking-widest text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                DECRYPTED SECURELY
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-[#E41613] transition-colors p-2 -mr-2 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Viewport */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-6 bg-[#0D0E10] relative dotted-grid-dark group">
          <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />

          {/* Left navigation arrow */}
          <button
            onClick={onPrev}
            disabled={!hasPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/60 text-white/80 hover:bg-[#E41613]/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronLeft size={28} />
          </button>

          {/* Right navigation arrow */}
          <button
            onClick={onNext}
            disabled={!hasNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/60 text-white/80 hover:bg-[#E41613]/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
          >
            <ChevronRight size={28} />
          </button>

          {!fileBytes ? (
            <div className="flex flex-col items-center gap-4 text-center max-w-sm">
              <div className="relative">
                <Loader2 className="w-12 h-12 animate-spin text-[#E41613]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-white animate-ping" />
                </div>
              </div>
              <div className="space-y-1">
                <span className="block text-xs uppercase tracking-[0.2em] font-bold text-white">
                  Decrypting Vault Core...
                </span>
                <span className="block text-[10px] text-white/30 tracking-wide">
                  Processing cryptographic blocks inside in-memory sandbox.
                </span>
              </div>
              
              {/* Tactical Skeleton Loader Mock */}
              <div className="w-64 space-y-2 mt-6">
                <div className="h-4 bg-white/5 animate-pulse rounded w-full" />
                <div className="h-3 bg-white/5 animate-pulse rounded w-5/6" />
                <div className="h-3 bg-white/5 animate-pulse rounded w-2/3" />
              </div>
            </div>
          ) : (
            <div className="relative z-10 w-full h-full flex items-center justify-center">
              <Suspense fallback={
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={24} className="animate-spin text-[#E41613]" />
                  <span className="text-xs tracking-widest uppercase text-white/30">LOADING VIEWER...</span>
                </div>
              }>
                <AdvancedViewer 
                  fileName={fileName}
                  fileBytes={fileBytes}
                  mimeType={mimeType}
                  allowDownload={true}
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
