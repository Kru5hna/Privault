"use client";

import React, { useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Folder,
  File,
  Share2,
  Loader2,
} from "lucide-react";
import { ScrambledText } from "@/components/scrambled-text";
import { TagBadge } from "@/components/tag-badge";
import { DocumentMetadata, FolderMetadata, TagMetadata } from "@/lib/api";

interface DocumentsTableProps {
  documents: DocumentMetadata[];
  folders: FolderMetadata[];
  docTagsCache: Record<string, TagMetadata[]>;
  isSandbox: boolean;
  loading: boolean;
  onFolderClick: (folderId: string, folderName: string) => void;
  onDocumentSelect: (doc: DocumentMetadata) => void;
  onPreview: (doc: DocumentMetadata) => void;
  onDownload: (doc: DocumentMetadata) => void;
  onShare: (doc: DocumentMetadata) => void;
  onDelete: (id: string) => void;
  onDeleteFolder: (folder: FolderMetadata) => void;
  displayedDocs: DocumentMetadata[];
  displayedFolders: FolderMetadata[];
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatDate = (isoStr: string) => {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ── Type guard ──
function isFolder(item: DocumentMetadata | FolderMetadata): item is FolderMetadata {
  return "parent_id" in item;
}

// ── Row Components ──

interface DocRowProps {
  doc: DocumentMetadata;
  docTagsCache: Record<string, TagMetadata[]>;
  isSandbox: boolean;
  onPreview: (doc: DocumentMetadata) => void;
  onDownload: (doc: DocumentMetadata) => void;
  onShare: (doc: DocumentMetadata) => void;
  onDelete: (id: string) => void;
  onDocumentSelect: (doc: DocumentMetadata) => void;
}

const DocRow = React.memo(function DocRow({
  doc,
  docTagsCache,
  isSandbox,
  onPreview,
  onDownload,
  onShare,
  onDelete,
  onDocumentSelect,
}: DocRowProps) {
  return (
    <div className="group border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.01] transition-colors">
      <div className="doc-row-grid sm:table-row">
        <div
          className="py-4 pr-4 text-sm text-white/95 cursor-pointer sm:table-cell"
          onClick={() => onDocumentSelect(doc)}
        >
          <div className="flex items-center gap-3">
            <File className="h-4 w-4 text-[#E41613] shrink-0" size={16} />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="min-w-0 break-all sm:truncate sm:max-w-md font-medium">
                <ScrambledText text={doc.name} delay={20} />
              </span>
              {!isSandbox && docTagsCache[doc.id]?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {docTagsCache[doc.id].map((t: TagMetadata) => (
                    <TagBadge key={t.id} tag={t} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="py-4 pr-4 text-xs text-white/40 font-mono whitespace-nowrap sm:table-cell">
          <span className="sm:hidden text-[10px] font-bold tracking-wider text-white/30 uppercase mr-2">Size</span>
          {formatSize(doc.size)}
        </div>
        <div className="py-4 pr-4 text-xs text-white/40 whitespace-nowrap sm:table-cell">
          <span className="sm:hidden text-[10px] font-bold tracking-wider text-white/30 uppercase mr-2">Seal Date</span>
          {formatDate(doc.created_at)}
        </div>
        <div className="py-4 sm:text-right sm:whitespace-nowrap sm:table-cell">
          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap justify-items-start sm:justify-end gap-4 items-center">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(doc); }}
              className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-white decoration-2 transition-all cursor-pointer"
            >
              Preview
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(doc); }}
              className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer"
            >
              Download
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onShare(doc); }}
              className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-[#E41613] hover:underline underline-offset-4 decoration-[#E41613] decoration-2 transition-all cursor-pointer flex items-center gap-1"
            >
              <Share2 size={12} />
              Share
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
              className="btn-delete-tactical relative cursor-pointer"
            >
              <span className="btn-bg" />
              <span className="btn-text">Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

interface FolderRowProps {
  folder: FolderMetadata;
  onFolderClick: (folderId: string, folderName: string) => void;
  onDeleteFolder: (folder: FolderMetadata) => void;
}

const FolderRow = React.memo(function FolderRow({
  folder,
  onFolderClick,
  onDeleteFolder,
}: FolderRowProps) {
  return (
    <div className="group border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.01] transition-colors">
      <div className="doc-row-grid sm:table-row">
        <div
          className="py-4 pr-4 text-sm text-white/95 cursor-pointer sm:table-cell"
          onClick={() => onFolderClick(folder.id, folder.name)}
        >
          <div className="flex items-center gap-3">
            <Folder className="h-4 w-4 text-amber-500 shrink-0" size={16} />
            <span className="min-w-0 break-all sm:truncate sm:max-w-md font-semibold text-white">
              {folder.name}
            </span>
          </div>
        </div>
        <div className="py-4 pr-4 text-xs text-white/40 font-mono whitespace-nowrap sm:table-cell">
          <span className="sm:hidden text-[10px] font-bold tracking-wider text-white/30 uppercase mr-2">Size</span>
          --
        </div>
        <div className="py-4 pr-4 text-xs text-white/40 whitespace-nowrap sm:table-cell">
          <span className="sm:hidden text-[10px] font-bold tracking-wider text-white/30 uppercase mr-2">Seal Date</span>
          {formatDate(folder.created_at)}
        </div>
        <div className="py-4 sm:text-right sm:whitespace-nowrap sm:table-cell">
          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap justify-items-start sm:justify-end gap-4 items-center">
            <button
              onClick={() => onFolderClick(folder.id, folder.name)}
              className="text-xs font-bold uppercase tracking-widest text-[#F5F5F0]/70 hover:text-white hover:underline underline-offset-4 decoration-white decoration-2 transition-all cursor-pointer"
            >
              Open
            </button>
            <button
              onClick={() => onDeleteFolder(folder)}
              className="btn-delete-tactical relative cursor-pointer"
            >
              <span className="btn-bg" />
              <span className="btn-text">Delete</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Header Component ──

const TableHeader = React.memo(function TableHeader() {
  return (
    <div className="doc-row-grid hidden sm:grid text-micro font-semibold text-white/40 tracking-[0.2em] border-b border-white/5 pb-4 mb-2">
      <div className="pr-4 font-bold">Name</div>
      <div className="pr-4 font-bold whitespace-nowrap">Size</div>
      <div className="pr-4 font-bold whitespace-nowrap">Seal Date</div>
      <div className="text-right font-bold">Actions</div>
    </div>
  );
});

// ── Main Component ──

export const DocumentsTable = React.memo(function DocumentsTable({
  displayedDocs,
  displayedFolders,
  docTagsCache,
  isSandbox,
  loading,
  onFolderClick,
  onDocumentSelect,
  onPreview,
  onDownload,
  onShare,
  onDelete,
  onDeleteFolder,
}: DocumentsTableProps) {
  const allItems = useMemo(
    () => [...displayedFolders, ...displayedDocs],
    [displayedFolders, displayedDocs]
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => 100, []),
    overscan: 5,
  });

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-[#E41613]" size={20} />
        <span className="text-xs tracking-widest uppercase text-white/30">
          LOADING ENCRYPTED METADATA...
        </span>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="py-16 text-center text-xs tracking-widest uppercase text-white/20">
        This folder is empty
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ maxHeight: "70vh", overflowY: "auto" }}
      className="custom-scrollbar"
    >
      <TableHeader />
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = allItems[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {isFolder(item) ? (
                <FolderRow
                  folder={item}
                  onFolderClick={onFolderClick}
                  onDeleteFolder={onDeleteFolder}
                />
              ) : (
                <DocRow
                  doc={item}
                  docTagsCache={docTagsCache}
                  isSandbox={isSandbox}
                  onPreview={onPreview}
                  onDownload={onDownload}
                  onShare={onShare}
                  onDelete={onDelete}
                  onDocumentSelect={onDocumentSelect}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
