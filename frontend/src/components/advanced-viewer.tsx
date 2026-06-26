"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const globalWindow = window as any;
  if (!globalWindow.__scriptPromises) {
    globalWindow.__scriptPromises = {};
  }
  if (globalWindow.__scriptPromises[src]) {
    return globalWindow.__scriptPromises[src];
  }

  const existingScript = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement;
  if (existingScript && existingScript.dataset.loaded === "true") {
    return Promise.resolve();
  }

  const promise = new Promise<void>((resolve, reject) => {
    if (existingScript) {
      const onScriptLoad = () => {
        existingScript.dataset.loaded = "true";
        resolve();
      };
      const onScriptError = (err: any) => {
        reject(err);
      };
      existingScript.addEventListener("load", onScriptLoad);
      existingScript.addEventListener("error", onScriptError);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  globalWindow.__scriptPromises[src] = promise;
  return promise;
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

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 4));
  const handleZoomOut = () => {
    setScale((s) => {
      const next = Math.max(s - 0.25, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  // Scroll-wheel zoom — natural-feeling and matches what users expect
  // from a "preview". Pinning maxScale at 4x prevents the image from
  // looking like garbage (CSS transform on a low-res bitmap only goes
  // so far). React's onWheel cannot preventDefault reliably, so we attach
  // a non-passive native listener.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        setScale((s) => Math.min(s + 0.25, 4));
      } else {
        setScale((s) => {
          const next = Math.max(s - 0.25, 1);
          if (next === 1) setPan({ x: 0, y: 0 });
          return next;
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
        <button onClick={handleZoomIn} disabled={scale === 4} className="p-1 hover:text-[#E41613] disabled:opacity-30 cursor-pointer">
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <button onClick={toggleFullscreen} className="p-1 hover:text-[#E41613] cursor-pointer">
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Scrollable viewport — overflow:auto so users can pan a zoomed
          image even when it grows beyond the modal, instead of getting
          clipped by the rounded overflow-hidden parent. */}
      <div
        className={`w-full h-full overflow-auto flex items-center justify-center ${scale > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={objectUrl}
          alt="Preview"
          // image-rendering keeps the upscale from looking extra mushy on
          // high-DPI displays when the user zooms past native resolution.
          className="max-w-full max-h-full object-contain pointer-events-none transition-transform duration-100 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
            imageRendering: "auto",
          }}
          onDragStart={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PDF Viewer Component (Light Theme Default, Lazy Render, No Re-render-on-keystroke)
// ─────────────────────────────────────────────────────────────────────────────
function PDFViewer({ fileBytes }: { fileBytes: Uint8Array }) {
  interface PDFRenderTask { promise: Promise<void>; cancel: () => void }
  const [pdfDoc, setPdfDoc] = useState<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (p: { scale: number }) => { width: number; height: number }; render: (p: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; transform?: number[] }) => PDFRenderTask; getTextContent: () => Promise<{ items: { str: string }[] }> }> } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.00);
  // Default to white theme per UX request; toggle still available.
  const [darkMode, setDarkMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightQuery, setHighlightQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});

  // Clear cached page dimensions and rendered status when scale changes
  const prevScaleRef = useRef(scale);
  useEffect(() => {
    const ratio = scale / prevScaleRef.current;
    if (ratio !== 1) {
      setPageDimensions((prev) => {
        const next: Record<number, { width: number; height: number }> = {};
        for (const [pageNumStr, dim] of Object.entries(prev)) {
          const pageNum = Number(pageNumStr);
          if (dim) {
            next[pageNum] = {
              width: dim.width * ratio,
              height: dim.height * ratio,
            };
          }
        }
        return next;
      });
    }
    prevScaleRef.current = scale;
    renderedPagesRef.current.clear();
    pageScaleRef.current.clear();
  }, [scale]);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<{ canvas: HTMLCanvasElement | null; text: HTMLDivElement | null; wrapper: HTMLDivElement | null }>>([]);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderTasksRef = useRef<Map<number, { cancel: () => void; promise: Promise<void> }>>(new Map());
  const lastPageRef = useRef(1);
  // Tracks the scale at which each page was last rendered so we know
  // when to invalidate the cache.
  const pageScaleRef = useRef<Map<number, number>>(new Map());
  // Stable snapshot of the bytes handed to pdf.js — the worker detaches
  // the underlying buffer on first consume, so we must NOT pass the same
  // reference back into a second getDocument call.
  const pdfBytesRef = useRef<Uint8Array | null>(null);

  // ── 1. Load document once ──────────────────────────────────────────────
  useEffect(() => {
    if (pdfBytesRef.current) return;
    let cancelled = false;
    async function loadPDF() {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
        const globalWindow = window as any;
        const pdfjsLib = (globalWindow.pdfjsLib || globalWindow["pdfjs-dist/build/pdf"]) as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (params: { data: Uint8Array; isEvalSupported?: boolean; disableFontFace?: boolean }) => { promise: Promise<{ numPages: number; getPage: (n: number) => unknown; destroy: () => Promise<void> }> };
        };
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        // Pass a fresh slice so the worker receives an uncloned buffer.
        // pdf.js will detach this view inside the worker on first use;
        // we keep `pdfBytesRef.current` as the same reference but never
        // hand it back to getDocument again.
        const bytes = fileBytes.slice(0);
        pdfBytesRef.current = bytes;

        const doc = await pdfjsLib.getDocument({
          data: bytes,
          // Load embedded PDF fonts so character metrics match the canvas perfectly.
          disableFontFace: false,
        }).promise;
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }
        setPdfDoc(doc as never);
        setTotalPages(doc.numPages);
        pageRefs.current = Array.from({ length: doc.numPages }, () => ({ canvas: null, text: null, wrapper: null }));
      } catch (err) {
        console.error("PDF loading error:", err);
      }
    }
    loadPDF();
    return () => {
      cancelled = true;
      // Cancel any in-flight renders on unmount.
      renderTasksRef.current.forEach((t) => { try { t.cancel(); } catch {} });
      renderTasksRef.current.clear();
    };
  }, [fileBytes]);

  // ── 2. Render a single page (lazy) ─────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDoc;
    if (!doc) return;
    const refs = pageRefs.current[pageNum - 1];
    if (!refs || !refs.canvas || !refs.text) return;

    // Already rendered at this exact scale → skip.
    if (renderedPagesRef.current.has(pageNum) && pageScaleRef.current.get(pageNum) === scale) {
      return;
    }

    // If scale changed, cancel and re-render at the new scale.
    const existing = renderTasksRef.current.get(pageNum);
    if (existing) {
      try { existing.cancel(); } catch {}
      renderTasksRef.current.delete(pageNum);
    }

    const canvas = refs.canvas;
    const textLayer = refs.text;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      setPageDimensions((prev) => {
        if (prev[pageNum]?.width === viewport.width && prev[pageNum]?.height === viewport.height) {
          return prev;
        }
        return { ...prev, [pageNum]: { width: viewport.width, height: viewport.height } };
      });

      // pdf.js requires the parent to expose the scale factor it uses.
      // Without this, the library logs the --scale-factor warning on
      // every render and the text layer mis-aligns on zoom.
      if (refs.wrapper) {
        refs.wrapper.style.setProperty("--scale-factor", String(scale));
      }

      // Setting canvas.width clears the bitmap; do it once per render.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      // High-DPI canvas handles sizing via CSS style width/height and backing store width/height.
      // Do NOT set canvas.style.transform = scale(dpr) as that would visually scale it a second time.

      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTasksRef.current.set(pageNum, renderTask);
      await renderTask.promise;
      renderTasksRef.current.delete(pageNum);
      renderedPagesRef.current.add(pageNum);
      pageScaleRef.current.set(pageNum, scale);

      // (Re)build the text layer only when scale actually changes.
      textLayer.innerHTML = "";
      const globalWindow = window as any;
      const pdfjsLib = (globalWindow.pdfjsLib || globalWindow["pdfjs-dist/build/pdf"]) as {
        renderTextLayer: (params: { textContentSource: unknown; container: HTMLElement; viewport: { width: number; height: number }; textDivs: [] }) => { promise: Promise<void> };
      };
      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport,
        textDivs: [],
      }).promise;

      applyHighlight(textLayer, highlightQuery);
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== "RenderingCancelledException") {
        console.error(`PDF rendering error page ${pageNum}:`, err);
      }
    }
  }, [pdfDoc, scale, highlightQuery, setPageDimensions]);

  // ── 3. Highlight utility (mutates DOM in place) ─────────────────────────
  const applyHighlight = useCallback((container: HTMLElement | null, query: string) => {
    if (!container) return;
    const spans = container.querySelectorAll("span");
    if (!query.trim()) {
      spans.forEach((span) => {
        if (span.dataset.highlighted === "1") {
          span.innerHTML = span.textContent || "";
          delete span.dataset.highlighted;
        }
      });
      return;
    }
    const escaped = query.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    spans.forEach((span) => {
      const text = span.textContent || "";
      if (text.toLowerCase().includes(query.trim().toLowerCase())) {
        if (span.dataset.highlighted === "1") {
          // Already wrapped — strip existing <mark>s and re-wrap.
          const stripped = span.innerHTML.replace(/<\/?mark>/g, "");
          span.innerHTML = stripped.replace(regex, `<mark>$1</mark>`);
        } else {
          span.innerHTML = text.replace(regex, `<mark>$1</mark>`);
          span.dataset.highlighted = "1";
        }
      } else if (span.dataset.highlighted === "1") {
        span.innerHTML = span.textContent || "";
        delete span.dataset.highlighted;
      }
    });
  }, []);

  // ── 4. Highlight changes apply in place — no full re-render ─────────────
  useEffect(() => {
    pageRefs.current.forEach((refs) => applyHighlight(refs.text, highlightQuery));
  }, [highlightQuery, applyHighlight]);

  // ── 5. Dark mode is now a pure CSS filter swap on existing canvases ────
  useEffect(() => {
    pageRefs.current.forEach((refs) => {
      const filter = darkMode ? "invert(0.9) hue-rotate(180deg)" : "none";
      if (refs.canvas) refs.canvas.style.filter = filter;
      if (refs.text) refs.text.style.filter = filter;
    });
  }, [darkMode]);

  const unloadPage = useCallback((pageNum: number) => {
    const refs = pageRefs.current[pageNum - 1];
    if (!refs) return;

    // Cancel any in-flight rendering task
    const existing = renderTasksRef.current.get(pageNum);
    if (existing) {
      try { existing.cancel(); } catch {}
      renderTasksRef.current.delete(pageNum);
    }

    // Clear canvas bitmap to free memory
    if (refs.canvas) {
      const ctx = refs.canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, refs.canvas.width, refs.canvas.height);
      }
      refs.canvas.width = 0;
      refs.canvas.height = 0;
      refs.canvas.style.width = "";
      refs.canvas.style.height = "";
    }

    // Clear text layer content
    if (refs.text) {
      refs.text.innerHTML = "";
      refs.text.style.width = "";
      refs.text.style.height = "";
    }

    // Remove from rendered sets
    renderedPagesRef.current.delete(pageNum);
    pageScaleRef.current.delete(pageNum);
  }, []);

  // ── 6. IntersectionObserver: only render visible pages ──────────────────
  // We use refs to read the latest renderPage + scale without making them
  // effect dependencies — otherwise every keystroke in the search field
  // would re-attach the observer and trigger a full re-render.
  const renderPageRef = useRef(renderPage);
  const scaleRef = useRef(scale);
  const unloadPageRef = useRef(unloadPage);

  useEffect(() => {
    renderPageRef.current = renderPage;
    scaleRef.current = scale;
    unloadPageRef.current = unloadPage;
  }, [renderPage, scale, unloadPage]);

  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = parseInt(entry.target.getAttribute("data-page-num") || "0", 10);
          if (pageNum > 0) {
            if (entry.isIntersecting) {
              renderPageRef.current(pageNum);
            } else {
              unloadPageRef.current(pageNum);
            }
          }
        }
        // Update the "current page" reading.
        let bestPage = lastPageRef.current;
        let bestRatio = 0;
        for (const entry of entries) {
          const page = parseInt(entry.target.getAttribute("data-page-num") || "0", 10);
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
      { root: scrollRef.current, rootMargin: "300px 0px", threshold: [0, 0.01, 0.1, 0.5] }
    );

    const elements: Element[] = [];
    pageRefs.current.forEach((_, i) => {
      const el = scrollRef.current?.querySelector(`[data-page-index="${i}"]`);
      if (el) {
        observer.observe(el);
        elements.push(el);
      }
    });

    // Render the first page immediately so the user sees content even if
    // it hasn't crossed the IntersectionObserver threshold yet.
    renderPageRef.current(1);

    return () => observer.disconnect();
  }, [pdfDoc, totalPages, scale]);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.25, 3.0));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

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
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      className="relative w-full h-full flex flex-col bg-white text-black border border-white/5 rounded overflow-hidden"
    >
      {/* Top Toolbar */}
      <div className="h-12 flex items-center justify-between px-4 bg-black/95 border-b border-white/10 relative z-20 text-white">
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
            title="Toggle Theme"
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
        <div className="absolute top-14 left-4 z-30 bg-black/90 backdrop-blur-md p-3 border border-white/10 rounded w-64 shadow-2xl">
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

      {/* Continuous scroll pages — white background is the default theme */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6 flex flex-col items-center bg-neutral-200 custom-scrollbar">
        <div className="w-full max-w-[1200px] flex flex-col items-center gap-6">
          {Array.from({ length: totalPages }, (_, i) => (
            <div
              key={i}
              data-page-index={i}
              data-page-num={i + 1}
              ref={(el) => { if (pageRefs.current[i]) pageRefs.current[i].wrapper = el; }}
              className="relative shadow-2xl bg-white select-text"
              style={{
                width: pageDimensions[i + 1] ? `${pageDimensions[i + 1].width}px` : "100%",
                height: pageDimensions[i + 1] ? `${pageDimensions[i + 1].height}px` : "auto",
                maxWidth: pageDimensions[i + 1] ? "none" : `${800 * scale}px`,
                aspectRatio: pageDimensions[i + 1] ? "auto" : "0.707",
                ["--scale-factor" as never]: scale
              }}
            >
              <canvas
                ref={(el) => { if (pageRefs.current[i]) pageRefs.current[i].canvas = el; }}
                className="block"
              />
              <div
                ref={(el) => { if (pageRefs.current[i]) pageRefs.current[i].text = el; }}
                className="textLayer absolute inset-0"
              />
            </div>
          ))}
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
