"use client";

import React, { useEffect, useState } from "react";
import { AdvancedViewer } from "./advanced-viewer";
import { Loader2, ShieldCheck, X } from "lucide-react";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileBytes: Uint8Array | null;
}

export function FilePreviewModal({ isOpen, onClose, fileName, fileBytes }: FilePreviewModalProps) {
  const [mimeType, setMimeType] = useState<string>("application/octet-stream");

  useEffect(() => {
    if (isOpen && fileBytes) {
      // Determine the mime type from file extension
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
      setMimeType(mimeMap[ext] || "application/octet-stream");
    }
  }, [isOpen, fileBytes, fileName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md">
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
        <div className="flex-1 overflow-hidden flex items-center justify-center p-6 bg-[#0D0E10] relative dotted-grid-dark">
          <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
          
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
              <AdvancedViewer 
                fileName={fileName}
                fileBytes={fileBytes}
                mimeType={mimeType}
                allowDownload={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
