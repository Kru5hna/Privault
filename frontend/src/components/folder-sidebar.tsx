import React, { useState, useMemo } from "react";
import { FolderMetadata, apiGetFolderStats } from "@/lib/api";
import { toast } from "sonner";
import { 
  Folder, 
  FolderPlus, 
  ChevronDown, 
  ChevronRight, 
  Trash2, 
  Edit3, 
  Plus, 
  Share2, 
  HardDrive, 
  FolderOpen,
  History,
  Loader2
} from "lucide-react";

interface TreeNode {
  folder: FolderMetadata;
  children: TreeNode[];
}

interface FolderSidebarProps {
  folders: FolderMetadata[];
  currentFolderId: string | null;
  onSelectFolder: (folderId: string | null, path: { id: string | null; name: string }[]) => void;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onDeleteFolder?: (folderId: string) => Promise<void>;
  onRenameFolder?: (folderId: string, newName: string) => Promise<void>;
  viewMode: "vault" | "shares" | "trash" | "activity";
  setViewMode: (mode: "vault" | "shares" | "trash" | "activity") => void;
  isOpen: boolean;
  onClose: () => void;
  sessionToken?: string;
}

export function FolderSidebar({
  folders,
  currentFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  viewMode,
  setViewMode,
  isOpen,
  onClose,
  sessionToken,
}: FolderSidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showNewFolderInput, setShowNewFolderInput] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Build tree structure
  const tree = useMemo(() => {
    const map: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];

    folders.forEach((f) => {
      map[f.id] = { folder: f, children: [] };
    });

    folders.forEach((f) => {
      if (f.parent_id && map[f.parent_id]) {
        map[f.parent_id].children.push(map[f.id]);
      } else {
        roots.push(map[f.id]);
      }
    });

    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }, [folders]);

  // Compute folder path for select handler
  const getFolderPath = (selectedId: string | null): { id: string | null; name: string }[] => {
    if (!selectedId) return [{ id: null, name: "Root" }];
    const path: { id: string | null; name: string }[] = [];
    let currentId: string | null = selectedId;

    while (currentId) {
      const f = folders.find((folder) => folder.id === currentId);
      if (f) {
        path.unshift({ id: f.id, name: f.name });
        currentId = f.parent_id;
      } else {
        break;
      }
    }
    path.unshift({ id: null, name: "Root" });
    return path;
  };

  const handleFolderClick = (folderId: string | null) => {
    setViewMode("vault");
    onSelectFolder(folderId, getFolderPath(folderId));
    if (window.innerWidth < 768) {
      onClose();
    }
  };


  const handleCreateFolderSubmit = async (e: React.FormEvent, parentId: string | null) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsProcessing(true);
    try {
      await onCreateFolder(newFolderName.trim(), parentId);
      setNewFolderName("");
      setShowNewFolderInput(null);
      if (parentId) {
        setExpanded((prev) => ({ ...prev, [parentId]: true }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    if (!renameFolderName.trim() || !onRenameFolder) return;
    setIsProcessing(true);
    try {
      await onRenameFolder(folderId, renameFolderName.trim());
      setEditingFolderId(null);
      setRenameFolderName("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Recursive Tree Node Renderer
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const { folder, children } = node;
    const isSelected = currentFolderId === folder.id && viewMode === "vault";
    const isNodeExpanded = !!expanded[folder.id];
    const hasChildren = children.length > 0;
    const isAddingHere = showNewFolderInput === folder.id;
    const isEditingHere = editingFolderId === folder.id;

    return (
      <div key={folder.id} className="w-full">
        {/* Folder row */}
        <div
          onClick={() => handleFolderClick(folder.id)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className={`group flex items-center justify-between py-1.5 pr-2 rounded cursor-pointer transition-all duration-150 border-l-2 select-none ${
            isSelected
              ? "bg-[#1E2026] text-white border-[#E41613]"
              : "text-[#8E929F] border-transparent hover:bg-[#1A1B20] hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden w-full">
            {/* Toggle Arrow */}
            <span
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => ({ ...prev, [folder.id]: !prev[folder.id] }));
              }}
              className="p-0.5 rounded hover:bg-[#252830] transition-colors"
            >
              {hasChildren ? (
                isNodeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span className="w-3.5 h-3.5 block" />
              )}
            </span>

            {/* Folder Icon */}
            {isSelected ? (
              <FolderOpen size={16} className="text-[#E41613] shrink-0" />
            ) : (
              <Folder size={16} className="text-[#8E929F] group-hover:text-white shrink-0" />
            )}

            {/* Folder Name */}
            {isEditingHere ? (
              <form
                onSubmit={(e) => handleRenameSubmit(e, folder.id)}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 w-full"
              >
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  className="bg-[#15161A] text-white text-xs px-1.5 py-0.5 rounded border border-[#E41613] outline-none w-full"
                  autoFocus
                  onBlur={() => setEditingFolderId(null)}
                />
              </form>
            ) : (
              <span className="text-xs truncate font-medium">
              {isProcessing && isSelected ? (
                <Loader2 size={10} className="inline animate-spin mr-1 text-[#E41613]" />
              ) : null}
              {folder.name}
            </span>
            )}
          </div>

          {/* Action buttons (shown on hover) */}
          {!isEditingHere && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0 ml-1">
              <button
                title="Add Subfolder"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNewFolderInput(folder.id);
                  setNewFolderName("");
                }}
                className="p-1 rounded text-[#8E929F] hover:text-[#E41613] hover:bg-[#252830]"
              >
                <FolderPlus size={12} />
              </button>
              {onRenameFolder && (
                <button
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingFolderId(folder.id);
                    setRenameFolderName(folder.name);
                  }}
                  className="p-1 rounded text-[#8E929F] hover:text-[#E41613] hover:bg-[#252830]"
                >
                  <Edit3 size={12} />
                </button>
              )}
              {onDeleteFolder && (
                <button
                  title="Delete"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!sessionToken) return;
                    try {
                      const stats = await apiGetFolderStats(folder.id, sessionToken);
                      toast.error(`Delete folder "${folder.name}"?`, {
                        description: `This will permanently delete:\n• ${stats.file_count} files\n• ${stats.subfolder_count} subfolders`,
                        duration: 10000,
                        action: {
                          label: "Delete",
                          onClick: () => {
                            onDeleteFolder(folder.id);
                          }
                        },
                        cancel: {
                          label: "Cancel",
                          onClick: () => {}
                        }
                      });
                    } catch (err) {
                      console.error("Failed to load folder stats:", err);
                      toast.error(`Delete folder "${folder.name}"?`, {
                        description: "Are you sure you want to delete this folder and all its contents?",
                        duration: 10000,
                        action: {
                          label: "Delete",
                          onClick: () => {
                            onDeleteFolder(folder.id);
                          }
                        },
                        cancel: {
                          label: "Cancel",
                          onClick: () => {}
                        }
                      });
                    }
                  }}
                  className="p-1 rounded text-[#8E929F] hover:text-red-500 hover:bg-[#252830]"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Input to create subfolder under this node */}
        {isAddingHere && (
          <form
            onSubmit={(e) => handleCreateFolderSubmit(e, folder.id)}
            style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            className="flex items-center gap-1 py-1 pr-2 w-full"
          >
            <FolderPlus size={14} className="text-[#E41613] shrink-0" />
            <input
              type="text"
              placeholder="Subfolder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="bg-[#1E2026] text-white text-xs px-2 py-0.5 rounded border border-[#E41613] outline-none w-full"
              autoFocus
              onBlur={() => setTimeout(() => setShowNewFolderInput(null), 200)}
            />
          </form>
        )}

        {/* Children nodes */}
        {isNodeExpanded && hasChildren && (
          <div className="w-full mt-0.5">
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Sidebar background overlay for mobile */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-xs transition-opacity duration-200"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#111215] border-r border-[#1E2026] flex flex-col transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 pl-14 border-b border-[#1E2026]">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg font-bold tracking-[0.25em] text-white">PRIVAULT</span>
            <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
          </div>
        </div>

        {/* Navigation Categories */}
        <div className="flex flex-col gap-1 p-3">
          {/* Vault Storage / Root */}
          <button
            onClick={() => {
              setViewMode("vault");
              handleFolderClick(null);
            }}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-xs font-semibold tracking-wide border-l-2 text-left transition-all ${
              viewMode === "vault" && currentFolderId === null
                ? "bg-[#1E2026] text-white border-[#E41613]"
                : "text-[#8E929F] border-white/10 hover:bg-[#16171C] hover:text-white hover:border-white/30"
            }`}
          >
            <HardDrive size={15} />
            <span>ROOT FOLDER</span>
          </button>

          {/* Shared Links View */}
          <button
            onClick={() => {
              setViewMode("shares");
              if (window.innerWidth < 768) {
                onClose();
              }
            }}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-xs font-semibold tracking-wide border-l-2 text-left transition-all ${
              viewMode === "shares"
                ? "bg-[#1E2026] text-white border-[#E41613]"
                : "text-[#8E929F] border-transparent hover:bg-[#16171C] hover:text-white"
            }`}
          >
            <Share2 size={15} />
            <span>SHARED LINKS</span>
          </button>

          {/* Recycle Bin (Trash) */}
          <button
            onClick={() => {
              setViewMode("trash");
              if (window.innerWidth < 768) {
                onClose();
              }
            }}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-xs font-semibold tracking-wide border-l-2 text-left transition-all ${
              viewMode === "trash"
                ? "bg-[#1E2026] text-white border-[#E41613]"
                : "text-[#8E929F] border-transparent hover:bg-[#16171C] hover:text-white"
            }`}
          >
            <Trash2 size={15} />
            <span>RECYCLE BIN</span>
          </button>

          {/* Activity Log */}
          <button
            onClick={() => {
              setViewMode("activity");
              if (window.innerWidth < 768) {
                onClose();
              }
            }}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded text-xs font-semibold tracking-wide border-l-2 text-left transition-all ${
              viewMode === "activity"
                ? "bg-[#1E2026] text-white border-[#E41613]"
                : "text-[#8E929F] border-transparent hover:bg-[#16171C] hover:text-white"
            }`}
          >
            <History size={15} />
            <span>ACTIVITY HISTORY</span>
          </button>
        </div>

        {/* Divider */}
        <div className="px-4 py-1">
          <div className="border-t border-[#1E2026] w-full" />
        </div>

        {/* Folders Section Title */}
        <div className="px-4 py-2 flex items-center justify-between text-[#5E626F] text-[10px] font-bold tracking-widest uppercase">
          <span>FOLDER STRUCTURE</span>
          <button
            title="Create root-level folder"
            onClick={() => {
              setShowNewFolderInput("root");
              setNewFolderName("");
            }}
            className="p-1 hover:text-[#E41613] rounded transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* Folder Tree Scroll Area */}
        <div className="flex-1 overflow-y-auto px-3 py-1 flex flex-col gap-1 custom-scrollbar">
          {/* New folder input at root level */}
          {showNewFolderInput === "root" && (
            <form
              onSubmit={(e) => handleCreateFolderSubmit(e, null)}
              className="flex items-center gap-2 py-1 px-2 w-full"
            >
              <FolderPlus size={14} className="text-[#E41613] shrink-0" />
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="bg-[#1E2026] text-white text-xs px-2 py-1 rounded border border-[#E41613] outline-none w-full"
                autoFocus
                onBlur={() => setTimeout(() => setShowNewFolderInput(null), 200)}
              />
            </form>
          )}

          {folders.length === 0 && !showNewFolderInput ? (
            <div className="text-center py-6 text-xs text-[#5E626F] italic">
              No folders created yet. Click the + icon above.
            </div>
          ) : (
            <div className="w-full flex flex-col gap-0.5">
              {tree.map((node) => renderNode(node, 0))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
