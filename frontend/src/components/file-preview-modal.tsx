import React, { useEffect, useState } from "react";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileBytes: Uint8Array | null;
}

export function FilePreviewModal({ isOpen, onClose, fileName, fileBytes }: FilePreviewModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("unknown");

  useEffect(() => {
    if (isOpen && fileBytes) {
      // Determine roughly what kind of file it is to preview
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      
      let mimeType = "application/octet-stream";
      let type = "unknown";

      if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
        mimeType = `image/${ext === "svg" ? "svg+xml" : ext === "jpg" ? "jpeg" : ext}`;
        type = "image";
      } else if (ext === "pdf") {
        mimeType = "application/pdf";
        type = "pdf";
      } else if (["txt", "md", "csv", "json", "js", "ts", "jsx", "tsx", "css", "html"].includes(ext)) {
        mimeType = "text/plain"; // Preview all code/text as text
        type = "text";
      }

      setFileType(type);
      
      const blob = new Blob([fileBytes as any], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      setObjectUrl(url);

      return () => {
        window.URL.revokeObjectURL(url);
      };
    } else {
      setObjectUrl(null);
      setFileType("unknown");
    }
  }, [isOpen, fileBytes, fileName]);

  // Read text files as string for rendering
  const [textContent, setTextContent] = useState<string>("");
  useEffect(() => {
    if (fileType === "text" && fileBytes) {
      const decoder = new TextDecoder();
      setTextContent(decoder.decode(fileBytes));
    }
  }, [fileType, fileBytes]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 sm:p-8 backdrop-blur-md">
       <div className="w-full h-full max-w-6xl flex flex-col bg-[#15161A] border border-white/10 rounded overflow-hidden shadow-2xl relative">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20">
             <div className="flex items-center gap-3">
               <svg className="w-5 h-5 text-[#E41613]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
               <span className="font-mono text-sm text-white font-bold">{fileName}</span>
             </div>
             <button
               onClick={onClose}
               className="text-white/50 hover:text-[#E41613] transition-colors p-2 -mr-2 cursor-pointer"
             >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 custom-scrollbar bg-[#0D0E10] relative dotted-grid-dark">
             <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
             
             {!fileBytes ? (
                <div className="flex flex-col items-center gap-4 text-white/50">
                  <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span className="text-xs uppercase tracking-[0.2em] font-bold">Decrypting in memory...</span>
                </div>
             ) : (
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  {fileType === "image" && objectUrl && (
                     <img src={objectUrl} alt={fileName} className="max-w-full max-h-full object-contain" />
                  )}

                  {fileType === "pdf" && objectUrl && (
                     <iframe src={objectUrl} className="w-full h-full rounded" />
                  )}

                  {fileType === "text" && (
                     <pre className="w-full h-full text-xs font-mono text-white/80 p-6 whitespace-pre-wrap overflow-auto custom-scrollbar bg-black/40 border border-white/5 rounded">
                       {textContent}
                     </pre>
                  )}

                  {fileType === "unknown" && (
                     <div className="flex flex-col items-center text-center gap-4 max-w-md">
                        <svg className="w-16 h-16 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        <div>
                          <p className="text-sm font-bold text-white mb-2">No preview available</p>
                          <p className="text-xs text-white/50">This file type cannot be previewed in the browser. You must download it to view its contents securely.</p>
                        </div>
                     </div>
                  )}
                </div>
             )}
          </div>
       </div>
    </div>
  );
}
