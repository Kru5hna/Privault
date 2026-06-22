"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  Search, 
  Moon, 
  Sun,
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
    const blob = new Blob([fileBytes as unknown as BlobPart], { type: mimeType });
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
  interface PDFRenderTask { promise: Promise<void>; cancel: () => void }
  const [pdfDoc, setPdfDoc] = useState<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (p: { scale: number }) => { width: number; height: number }; render: (p: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => PDFRenderTask; getTextContent: () => Promise<{ items: { str: string }[] }> }> } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [darkMode, setDarkMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [rendering, setRendering] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<{ canvas: HTMLCanvasElement | null; text: HTMLDivElement | null }>>([]);
  const renderTasksRef = useRef<Map<number, { cancel: () => void; promise: Promise<void> }>>(new Map());
  const lastPageRef = useRef(1);

  useEffect(() => {
    if (!searchQuery.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighlightQuery("");
    }
  }, [searchQuery]);

  useEffect(() => {
    async function loadPDF() {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        const pdfjsLib = (window as unknown as Record<string, unknown>)["pdfjs-dist/build/pdf"] as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (params: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => unknown }> };
        };
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const doc = await pdfjsLib.getDocument({ data: fileBytes }).promise;
        setPdfDoc(doc as never);
        setTotalPages(doc.numPages);
        pageRefs.current = Array.from({ length: doc.numPages }, () => ({ canvas: null, text: null }));
      } catch (err) {
        console.error("PDF loading error:", err);
      }
    }
    loadPDF();
  }, [fileBytes]);

  // Render all pages when pdfDoc, scale, darkMode, or highlightQuery change
  useEffect(() => {
    const doc = pdfDoc;
    if (!doc || totalPages === 0) return;

    let cancelled = false;

    async function renderAllPages() {
      setRendering(true);
      renderTasksRef.current.forEach(task => { try { task.cancel(); } catch {} });
      renderTasksRef.current.clear();

      const pdfjsLib = (window as unknown as Record<string, unknown>)["pdfjs-dist/build/pdf"] as {
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (params: { data: Uint8Array }) => { promise: Promise<unknown> };
        renderTextLayer: (params: { textContentSource: unknown; container: HTMLElement; viewport: { width: number; height: number }; textDivs: [] }) => { promise: Promise<void> };
      };

      for (let i = 0; i < totalPages; i++) {
        if (cancelled) break;

        const pageNum = i + 1;
        const refs = pageRefs.current[i];
        if (!refs || !refs.canvas || !refs.text) continue;

        const canvas = refs.canvas;
        const textLayer = refs.text;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;

        try {
          const page = await doc!.getPage(pageNum);
          const viewport = page.getViewport({ scale });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.filter = darkMode ? "invert(0.9) hue-rotate(180deg)" : "none";

          const renderTask = page.render({ canvasContext: ctx, viewport });
          renderTasksRef.current.set(pageNum, renderTask);
          await renderTask.promise;
          renderTasksRef.current.delete(pageNum);

          textLayer.innerHTML = "";
          textLayer.style.width = `${viewport.width}px`;
          textLayer.style.height = `${viewport.height}px`;
          textLayer.style.filter = darkMode ? "invert(0.9) hue-rotate(180deg)" : "none";

          const textContent = await page.getTextContent() as { items: { str: string }[] };
          await pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
            textDivs: []
          }).promise;

          if (highlightQuery.trim()) {
            const spans = textLayer.querySelectorAll("span");
            const query = highlightQuery.trim().toLowerCase();
            spans.forEach((span) => {
              const text = span.textContent || "";
              if (text.toLowerCase().includes(query)) {
                try {
                  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
                  span.innerHTML = text.replace(regex, `<mark>$1</mark>`);
                } catch {}
              }
            });
          }
        } catch (err: unknown) {
          if ((err as { name?: string }).name !== "RenderingCancelledException") {
            console.error(`PDF rendering error page ${pageNum}:`, err);
          }
        }
      }

      if (!cancelled) setRendering(false);
    }

    renderAllPages();
    return () => { cancelled = true; };
  }, [pdfDoc, totalPages, scale, darkMode, highlightQuery]);

  // IntersectionObserver for scroll-based page tracking
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;

    const pageElements: Element[] = [];
    for (let i = 0; i < totalPages; i++) {
      const el = scrollRef.current?.querySelector(`[data-page-index="${i}"]`);
      if (el) pageElements.push(el);
    }

    if (pageElements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestPage = lastPageRef.current;
        let bestRatio = 0;
        for (const entry of entries) {
          const page = parseInt(entry.target.getAttribute("data-page-num") || "0");
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestPage = page;
          }
        }
        if (bestRatio > 0 && bestPage !== lastPageRef.current) {
          lastPageRef.current = bestPage;
          setCurrentPage(bestPage);
        }
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] }
    );

    pageElements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pdfDoc, totalPages, scale]);

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

  const scrollToPage = (page: number) => {
    const el = scrollRef.current?.querySelector(`[data-page-index="${page - 1}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const strings = textContent.items.map((item: { str: string }) => item.str).join(" ");
      if (strings.toLowerCase().includes(term.toLowerCase())) {
        results.push({ page: i, text: strings });
      }
    }
    setSearchResults(results);
    if (results.length > 0) {
      scrollToPage(results[0].page);
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
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono">
            Page {currentPage} of {totalPages}
          </span>
        </div>

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
                  onClick={() => scrollToPage(r.page)}
                  className="w-full text-left p-1 hover:bg-white/5 hover:text-white rounded"
                >
                  Page {r.page} - Match found
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Continuous scroll pages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 flex flex-col items-center bg-black/10 custom-scrollbar">
        <div className="w-full max-w-[900px] flex flex-col items-center gap-6">
          {Array.from({ length: totalPages }, (_, i) => (
            <div
              key={i}
              data-page-index={i}
              data-page-num={i + 1}
              className="relative shadow-2xl bg-white select-text w-full"
            >
              <canvas
                ref={el => { pageRefs.current[i].canvas = el; }}
                className="block w-full"
                style={{
                  filter: darkMode ? "invert(0.9) hue-rotate(180deg)" : "none",
                  transition: "filter 0.3s ease"
                }}
              />
              <div
                ref={el => { pageRefs.current[i].text = el; }}
                className="textLayer absolute inset-0"
                style={{
                  filter: darkMode ? "invert(0.9) hue-rotate(180deg)" : "none",
                  transition: "filter 0.3s ease"
                }}
              />
            </div>
          ))}
          {rendering && (
            <div className="flex items-center gap-2 py-4 text-xs text-white/30">
              <Loader2 size={14} className="animate-spin" />
              Rendering pages...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Video Viewer Component (Blob Streaming)
// ─────────────────────────────────────────────────────────────────────────────
function VideoViewer({ fileBytes, ext }: { fileBytes: Uint8Array; ext: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const mime = `video/${ext === "mov" ? "mp4" : ext}`;
    const file = new File([fileBytes as BlobPart], `video.${ext}`, { type: mime });
    objectUrlRef.current = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.src = objectUrlRef.current;
      videoRef.current.load();
    }

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [fileBytes, ext]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#0D0E10] border border-white/5 rounded overflow-hidden">
      <video 
        ref={videoRef}
        controls
        preload="auto"
        className="w-full h-full max-h-[80vh] object-contain"
        onContextMenu={(e) => e.preventDefault()}
        onError={(e) => console.error("Video playback error:", e.currentTarget.error?.message)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Text / Code Viewer Component (Prism syntax coloring & Line numbers)
// ─────────────────────────────────────────────────────────────────────────────
function TextViewer({ fileBytes, ext }: { fileBytes: Uint8Array; ext: string }) {
  const [prismLoaded, setPrismLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const textContent = React.useMemo(() => new TextDecoder().decode(fileBytes), [fileBytes]);

  const codeRef = useRef<HTMLElement>(null);

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
      const Prism = (window as unknown as { Prism?: { highlightElement: (el: HTMLElement) => void } }).Prism;
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
