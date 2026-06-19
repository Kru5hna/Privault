import React, { useEffect, useState } from "react";
import { DocumentMetadata } from "@/lib/api";
import { ScrambledText } from "@/components/scrambled-text";

interface FileDetailsPanelProps {
  doc: DocumentMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FileDetailsPanel({ doc, isOpen, onClose }: FileDetailsPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Determine file type simply from extension
  const getFileType = (filename: string) => {
    const parts = filename.split(".");
    if (parts.length > 1) {
      return parts.pop()?.toUpperCase() || "UNKNOWN";
    }
    return "UNKNOWN";
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-md bg-[#15161A] border-l border-white/5 shadow-2xl transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col relative overflow-hidden dotted-grid-dark">
          <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
          
          {/* Header */}
          <div className="relative z-10 flex items-center justify-between border-b border-white/5 px-6 py-6">
            <h2 className="font-serif text-lg font-light tracking-widest text-white uppercase">
              Document Intel
            </h2>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-[#E41613] transition-colors p-2 -mr-2 cursor-pointer"
              aria-label="Close panel"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8 custom-scrollbar">
            {doc ? (
              <div className="flex flex-col gap-8">
                {/* File Icon/Type Area */}
                <div className="flex flex-col items-center justify-center rounded bg-[#1A1C20] border border-white/5 py-12 px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E41613]/10 border border-[#E41613]/20 mb-4 text-[#E41613]">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white break-all leading-tight">
                    <ScrambledText text={doc.name} delay={15} />
                  </h3>
                  <span className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#E41613] text-[#F5F5F0] text-micro font-bold">
                    {getFileType(doc.name)} FILE
                  </span>
                </div>

                {/* Details Grid */}
                <div className="flex flex-col gap-4 border-t border-white/5 pt-6">
                  <h4 className="text-micro text-white/50 mb-2">Cryptographic Metadata</h4>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">Status</span>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span className="text-sm font-medium text-white/90">AES-256-GCM Encrypted</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">Size</span>
                      <span className="text-sm font-mono text-white/90">{formatSize(doc.size)}</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">Created</span>
                      <span className="text-sm text-white/90">{formatDate(doc.created_at)}</span>
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">Modified</span>
                      <span className="text-sm text-white/90">{formatDate(doc.updated_at)}</span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mb-1">Document ID</span>
                      <span className="text-xs font-mono text-white/60 break-all bg-white/5 p-2 rounded">{doc.id}</span>
                    </div>
                  </div>
                </div>

                {/* Threat model note */}
                <div className="rounded border border-amber-500/20 bg-amber-500/5 p-4 mt-4">
                  <h5 className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Zero-Knowledge Note
                  </h5>
                  <p className="text-xs text-amber-500/70 leading-relaxed">
                    The server cannot read this file. It is encrypted with a unique DEK, which is then wrapped using your RSA-2048 public key.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-xs tracking-widest text-white/30 uppercase animate-pulse">Loading intel...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
