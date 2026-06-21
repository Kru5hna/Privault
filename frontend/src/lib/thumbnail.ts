// Client-side thumbnail generation and IndexedDB caching for Privault.

const DB_NAME = "privault_thumbnails";
const STORE_NAME = "thumbnails";
const DB_VERSION = 1;

export interface ThumbnailCacheEntry {
  id: string;
  dataUrl: string;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB Helper
// ─────────────────────────────────────────────────────────────────────────────
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function getThumbnailFromCache(docId: string): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(docId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as ThumbnailCacheEntry | undefined;
        resolve(result ? result.dataUrl : null);
      };
    });
  } catch (err) {
    console.error("IndexedDB read error:", err);
    return null;
  }
}

export async function saveThumbnailToCache(docId: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      const entry: ThumbnailCacheEntry = {
        id: docId,
        dataUrl,
        timestamp: Date.now(),
      };
      
      const request = store.put(entry);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    // Enforce LRU eviction (max 100 entries)
    await enforceCacheLimit(db);
  } catch (err) {
    console.error("IndexedDB write error:", err);
  }
}

async function enforceCacheLimit(db: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as ThumbnailCacheEntry[];
      if (entries.length > 100) {
        // Sort by timestamp ascending (oldest first)
        entries.sort((a, b) => a.timestamp - b.timestamp);
        const toDeleteCount = entries.length - 100;
        for (let i = 0; i < toDeleteCount; i++) {
          store.delete(entries[i].id);
        }
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Script Loader (for pdf.js)
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

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a thumbnail from decrypted file bytes
 */
export async function generateThumbnail(
  docId: string,
  fileName: string,
  fileBytes: Uint8Array
): Promise<string> {
  // Check cache first
  const cached = await getThumbnailFromCache(docId);
  if (cached) return cached;

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  let dataUrl = "";

  try {
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      dataUrl = await generateImageThumbnail(fileBytes, ext);
    } else if (ext === "pdf") {
      dataUrl = await generatePDFThumbnail(fileBytes);
    } else if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
      dataUrl = await generateVideoThumbnail(fileBytes, ext);
    }
  } catch (err) {
    console.warn("Failed to generate thumbnail for", fileName, err);
  }

  // Save to cache if generated
  if (dataUrl) {
    await saveThumbnailToCache(docId, dataUrl);
    return dataUrl;
  }

  throw new Error("Unsupported or failed thumbnail generation");
}

function generateImageThumbnail(bytes: Uint8Array, ext: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
    const blob = new Blob([bytes as any], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context is null"));
        return;
      }

      // Max dimension 120px for thumbnails
      const maxDim = 120;
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const result = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(result);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

function generateVideoThumbnail(bytes: Uint8Array, ext: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mime = `video/${ext === "mov" ? "mp4" : ext}`;
    const blob = new Blob([bytes as any], { type: mime });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    // Load first frame
    video.onloadeddata = () => {
      video.currentTime = 0.5; // seek past potential black screen
    };

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context is null"));
        return;
      }

      const maxDim = 120;
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      const result = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(result);
    };

    video.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    video.src = url;
    video.load();
  });
}

async function generatePDFThumbnail(bytes: Uint8Array): Promise<string> {
  // Load pdf.js CDN
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
  const pdfjsLib = (window as any)["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context is null");

  const viewport = page.getViewport({ scale: 0.5 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Scale down the canvas to thumbnail size
  const finalCanvas = document.createElement("canvas");
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Canvas context is null");

  const maxDim = 120;
  let w = canvas.width;
  let h = canvas.height;
  if (w > h) {
    if (w > maxDim) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    }
  } else {
    if (h > maxDim) {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }

  finalCanvas.width = w;
  finalCanvas.height = h;
  finalCtx.drawImage(canvas, 0, 0, w, h);

  return finalCanvas.toDataURL("image/jpeg", 0.7);
}
