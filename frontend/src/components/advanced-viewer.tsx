"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Moon, 
  Sun,
  Download,
  AlertCircle,
  Loader2
} from "lucide-react";

interface AdvancedViewerProps {
  fileName: string;
  fileBytes: Uint8Array;
  mimeType: string;
  allowDownload?: boolean; // feature 5
}

// ─────────────────────────────────────────────────────────────────────────────
// Stylesheet & Script Helpers
// ─────────────────────────────────────────────────────────────────────────────
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function loadStyle(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

export function AdvancedViewer({ fileName, fileBytes, mimeType, allowDownload = true }: AdvancedViewerProps) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
    return <ImageViewer fileBytes={fileBytes} mimeType={mimeType} />;
  }

  if (ext === "pdf") {
    return <PDFViewer fileBytes={fileBytes} />;
  }

  if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
    return <VideoViewer fileBytes={fileBytes} ext={ext} />;
  }

  if (["txt", "md", "json", "csv", "js", "ts", "jsx", "tsx", "css", "html", "rs", "go", "py", "sh", "yaml", "yml"].includes(ext)) {
    return <TextViewer fileBytes={fileBytes} ext={ext} />;
  }

  return (
    <div className="flex flex-col items-center text-center gap-4 max-w-md p-6 bg-[#111215] border border-white/5 rounded">
      <AlertCircle className="w-16 h-16 text-white/20" />
      <div>
        <p className="text-sm font-bold text-white mb-2">Preview not available</p>
        <p className="text-xs text-white/50 leading-relaxed">
          This file format ({ext.toUpperCase()}) cannot be rendered directly in the browser. 
          {allowDownload ? " Please download the file to decrypt and view it locally." : " Downloading is restricted for this link."}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Image Viewer Component (Zoom & Pan & Fullscreen)
// ─────────────────────────────────────────────────────────────────────────────
function ImageViewer({ fileBytes, mimeType }: { fileBytes: Uint8Array; mimeType: string }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const objectUrl = React.useMemo(() => {
    const blob = new Blob([fileBytes as any], { type: mimeType });
    return URL.createObjectURL(blob);
  }, [fileBytes, mimeType]);

  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 5));
  const handleZoomOut = () => {
    setScale(s => {
      const next = Math.max(s - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale === 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center justify-center bg-black/40 overflow-hidden rounded select-none"
    >
      {/* Control bar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 border border-white/10 rounded">
        <button onClick={handleZoomOut} disabled={scale === 1} className="p-1 hover:text-[#E41613] disabled:opacity-30 cursor-pointer">
          <ZoomOut size={16} />
        </button>
        <span className="text-[10px] font-mono min-w-12 text-center text-white/80">{Math.round(scale * 100)}%</span>
        <button onClick={handleZoomIn} disabled={scale === 5} className="p-1 hover:text-[#E41613] disabled:opacity-30 cursor-pointer">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={toggleFullscreen} className="p-1 hover:text-[#E41613] cursor-pointer">
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Image container */}
      <div 
        className={`w-full h-full flex items-center justify-center ${scale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={objectUrl} 
          alt="Preview" 
          className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
          onDragStart={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PDF Viewer Component (Dark Mode, Text Search, Custom Navigation)
// ─────────────────────────────────────────────────────────────────────────────
function PDFViewer({ fileBytes }: { fileBytes: Uint8Array }) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [darkMode, setDarkMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setHighlightQuery("");
    }
  }, [searchQuery]);

  useEffect(() => {
    async function loadPDF() {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        const pdfjsLib = (window as any)["pdfjs-dist/build/pdf"];
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const doc = await pdfjsLib.getDocument({ data: fileBytes }).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setPageNum(1);
      } catch (err) {
        console.error("PDF loading error:", err);
      }
    }
    loadPDF();
  }, [fileBytes]);

  const renderPage = useCallback(async (num: number, currentScale: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel existing render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    try {
      const page = await pdfDoc.getPage(num);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const viewport = page.getViewport({ scale: currentScale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      renderTaskRef.current = null;

      // Render text layer overlay
      const textLayerContainer = textLayerRef.current;
      if (textLayerContainer) {
        textLayerContainer.innerHTML = "";
        textLayerContainer.style.width = `${viewport.width}px`;
        textLayerContainer.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();
        const pdfjsLib = (window as any)["pdfjs-dist/build/pdf"];
        
        await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerContainer,
          viewport: viewport,
          textDivs: []
        }).promise;

        // Perform search highlight filtering on spans
        if (highlightQuery.trim()) {
          const spans = textLayerContainer.querySelectorAll("span");
          const query = highlightQuery.trim().toLowerCase();
          
          spans.forEach((span) => {
            const text = span.textContent || "";
            if (text.toLowerCase().includes(query)) {
              const regex = new RegExp(`(${query})`, "gi");
              span.innerHTML = text.replace(regex, `<mark>$1</mark>`);
            }
          });
        }
      }
    } catch (err: any) {
      if (err.name !== "RenderingCancelledException") {
        console.error("PDF rendering error:", err);
      }
    }
  }, [pdfDoc, highlightQuery]);

  useEffect(() => {
    renderPage(pageNum, scale);
  }, [pageNum, scale, renderPage]);

  const handlePrevPage = () => setPageNum(p => Math.max(p - 1, 1));
  const handleNextPage = () => setPageNum(p => Math.min(p + 1, totalPages));

  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 3.0));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !pdfDoc) return;

    const term = searchQuery.trim();
    setHighlightQuery(term);

    const results: { page: number; text: string }[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item: any) => item.str).join(" ");
      if (strings.toLowerCase().includes(term.toLowerCase())) {
        results.push({ page: i, text: strings });
      }
    }
    setSearchResults(results);
    if (results.length > 0) {
      if (pageNum === results[0].page) {
        renderPage(pageNum, scale);
      } else {
        setPageNum(results[0].page);
      }
    } else {
      toast.error("No matches found");
    }
  };

  if (!pdfDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 bg-[#111215] w-full h-full min-h-[300px] border border-white/5 rounded">
        <Loader2 size={24} className="animate-spin text-[#E41613]" />
        <span className="text-xs tracking-widest uppercase text-white/30 font-bold">
          PARSING SECURE DOCUMENT BLOCKS...
        </span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex flex-col bg-[#111215] text-[#F5F5F0] border border-white/5 rounded overflow-hidden"
    >
      {/* Top Toolbar */}
      <div className="h-12 flex items-center justify-between px-4 bg-black/40 border-b border-white/5 relative z-20">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrevPage} 
            disabled={pageNum <= 1}
            className="p-1 hover:bg-white/5 rounded disabled:opacity-30 cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-mono">
            Page {pageNum} of {totalPages}
          </span>
          <button 
            onClick={handleNextPage} 
            disabled={pageNum >= totalPages}
            className="p-1 hover:bg-white/5 rounded disabled:opacity-30 cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* View adjustments */}
        <div className="flex items-center gap-3">
          <button onClick={handleZoomOut} disabled={scale <= 0.5} className="p-1 hover:text-[#E41613] disabled:opacity-30 cursor-pointer">
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] font-mono w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={handleZoomIn} disabled={scale >= 3.0} className="p-1 hover:text-[#E41613] disabled:opacity-30 cursor-pointer">
            <ZoomIn size={16} />
          </button>
          <div className="w-px h-4 bg-white/10" />
          
          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="p-1 hover:text-[#E41613] cursor-pointer"
            title="Toggle Dark Mode"
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          
          <button 
            onClick={() => setSearchOpen(!searchOpen)} 
            className={`p-1 hover:text-[#E41613] cursor-pointer ${searchOpen ? "text-[#E41613]" : ""}`}
            title="Search inside PDF"
          >
            <Search size={16} />
          </button>

          <button onClick={toggleFullscreen} className="p-1 hover:text-[#E41613] cursor-pointer">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Floating Search Panel */}
      {searchOpen && (
        <div className="absolute top-14 left-4 z-30 bg-black/80 backdrop-blur-md p-3 border border-white/10 rounded w-64 shadow-2xl">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              type="text" 
              placeholder="Search text..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-[#15161A] text-white text-xs px-2.5 py-1.5 border border-white/10 outline-none focus:border-[#E41613]"
            />
            <button type="submit" className="p-1.5 bg-[#E41613] text-white rounded cursor-pointer">
              <Search size={14} />
            </button>
          </form>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto text-[10px] text-white/50 space-y-1">
              {searchResults.map((r, idx) => (
                <button
                  key={idx}
                  onClick={() => setPageNum(r.page)}
                  className="w-full text-left p-1 hover:bg-white/5 hover:text-white rounded"
                >
                  Page {r.page} - Match found
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canvas container */}
      <div className="flex-1 overflow-auto p-6 flex justify-center bg-black/10 custom-scrollbar">
        <div className="my-auto relative shadow-2xl bg-white select-text">
          <canvas 
            ref={canvasRef} 
            className="block"
            style={{
              filter: darkMode ? "invert(0.9) hue-rotate(180deg)" : "none",
              transition: "filter 0.3s ease"
            }}
          />
          <div 
            ref={textLayerRef} 
            className="textLayer" 
            style={{
              filter: darkMode ? "invert(0.9) hue-rotate(180deg)" : "none",
              transition: "filter 0.3s ease"
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Video Viewer Component (Blob Streaming)
// ─────────────────────────────────────────────────────────────────────────────
function VideoViewer({ fileBytes, ext }: { fileBytes: Uint8Array; ext: string }) {
  const objectUrl = React.useMemo(() => {
    const mime = `video/${ext === "mov" ? "mp4" : ext}`;
    const blob = new Blob([fileBytes as any], { type: mime });
    return URL.createObjectURL(blob);
  }, [fileBytes, ext]);

  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#0D0E10] border border-white/5 rounded overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video 
        src={objectUrl} 
        controls 
        className="w-full h-full max-h-[80vh] object-contain"
        onContextMenu={(e) => e.preventDefault()} // Disable right click download
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Text / Code Viewer Component (Prism syntax coloring & Line numbers)
// ─────────────────────────────────────────────────────────────────────────────
function TextViewer({ fileBytes, ext }: { fileBytes: Uint8Array; ext: string }) {
  const [textContent, setTextContent] = useState("");
  const [prismLoaded, setPrismLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(-1);
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const text = new TextDecoder().decode(fileBytes);
    setTextContent(text);
  }, [fileBytes]);

  useEffect(() => {
    async function loadPrism() {
      try {
        await loadStyle("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js");
        
        // Load language support based on extension
        if (["rs"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-rust.min.js");
        } else if (["ts", "tsx"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js");
        } else if (["go"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-go.min.js");
        } else if (["py"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js");
        } else if (["json"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js");
        } else if (["md"].includes(ext)) {
          await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markdown.min.js");
        }

        setPrismLoaded(true);
      } catch (err) {
        console.error("Prism load error:", err);
      }
    }
    loadPrism();
  }, [ext]);

  useEffect(() => {
    if (prismLoaded && codeRef.current && textContent) {
      const Prism = (window as any).Prism;
      if (Prism) {
        Prism.highlightElement(codeRef.current);
      }
    }
  }, [prismLoaded, textContent]);

  const mapExtensionToLanguageClass = (extension: string) => {
    const langMap: Record<string, string> = {
      js: "language-javascript",
      jsx: "language-jsx",
      ts: "language-typescript",
      tsx: "language-tsx",
      rs: "language-rust",
      go: "language-go",
      py: "language-python",
      json: "language-json",
      md: "language-markdown",
      css: "language-css",
      html: "language-markup",
      xml: "language-markup",
      csv: "language-text",
      txt: "language-text",
    };
    return langMap[extension] || "language-text";
  };

  const lines = textContent.split("\n");

  return (
    <div className="w-full h-full flex flex-col bg-[#111215] text-[#F5F5F0] border border-white/5 rounded overflow-hidden">
      {/* Search Header */}
      <div className="h-10 flex items-center justify-between px-4 bg-black/40 border-b border-white/5 relative z-20">
        <span className="text-[10px] font-mono text-white/50">{ext.toUpperCase()} Source File</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-[#15161A] text-white text-[10px] px-2.5 py-1 border border-white/10 outline-none focus:border-[#E41613]"
          />
        </div>
      </div>

      {/* Code Area with Line Numbers */}
      <div className="flex-1 overflow-auto p-4 flex custom-scrollbar bg-black/40">
        {/* Line numbers column */}
        <div className="select-none text-right pr-4 border-r border-white/5 font-mono text-[11px] text-white/20 min-w-8">
          {lines.map((_, idx) => (
            <div key={idx} className="h-5">{idx + 1}</div>
          ))}
        </div>

        {/* Highlighted Pre */}
        <pre className="flex-1 pl-4 m-0 font-mono text-[11px] leading-5 text-white/80 overflow-visible">
          <code ref={codeRef} className={`${mapExtensionToLanguageClass(ext)} bg-transparent! p-0!`}>
            {textContent}
          </code>
        </pre>
      </div>
    </div>
  );
}
