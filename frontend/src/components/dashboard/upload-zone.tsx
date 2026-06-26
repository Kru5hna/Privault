"use client";

import React, { useRef } from "react";
import { UploadCloud } from "lucide-react";

interface UploadZoneProps {
  uploadState: "idle" | "encrypting" | "uploading" | "complete";
  uploadError: string | null;
  isDragActive: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilesSelected: (files: FileList) => void;
  onFolderSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
}

export const UploadZone = React.memo(function UploadZone({
  uploadState,
  uploadError,
  isDragActive,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onFilesSelected,
  onFolderSelect,
  onCancel,
}: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (uploadState === "idle") {
      fileInputRef.current?.click();
    }
  };

  return (
    <section
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={handleClick}
      className={`group relative mb-8 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed transition-all duration-300 rounded-none ${
        isDragActive
          ? "border-[#E41613] bg-[#E41613]/5 scale-[0.99] shadow-[0_0_24px_rgba(228,22,19,0.15)]"
          : "border-white/10 bg-[#15161A] hover:border-[#E41613] hover:bg-white/[0.01]"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        onChange={(e) => e.target.files && onFilesSelected(e.target.files)}
        multiple
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        onChange={onFolderSelect}
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        className="hidden"
      />

      {uploadState === "encrypting" && (
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <svg className="h-6 w-6 animate-pulse text-[#E41613]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-micro font-bold tracking-[0.2em] text-[#E41613]">
            ENCRYPTING LOCALLY...
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[#8E929F] hover:text-[#E41613] transition-colors cursor-pointer underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}

      {uploadState === "uploading" && (
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <svg className="h-6 w-6 animate-spin text-[#E41613]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-micro font-bold tracking-[0.2em] text-[#E41613]">
            UPLOADING CIPHERTEXT...
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-[#8E929F] hover:text-[#E41613] transition-colors cursor-pointer underline underline-offset-2"
          >
            Cancel
          </button>
        </div>
      )}

      {uploadState === "complete" && (
        <div className="flex flex-col items-center justify-center gap-3 text-center text-green-500">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-micro font-bold tracking-[0.2em]">
            SEALED & VERIFIED
          </span>
        </div>
      )}

      {uploadState === "idle" && (
        <div className="text-center p-6 flex flex-col items-center justify-center gap-4">
          <UploadCloud size={32} className="text-[#E41613]/60" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-white/60 group-hover:text-white transition-colors duration-300">
              Drag files/folders here, click to browse files, or{" "}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="underline text-[#E41613] hover:text-white cursor-pointer font-bold"
              >
                upload a folder
              </button>
            </p>
            <p className="text-xs text-white/30 tracking-wide mt-2">
              Files are AES-256-GCM encrypted in the browser before leaving your machine
            </p>
          </div>
        </div>
      )}
      {uploadError && (
        <p className="mt-3 text-center text-xs font-semibold text-[#E41613] sm:absolute sm:bottom-2">
          {uploadError}
        </p>
      )}
    </section>
  );
});
