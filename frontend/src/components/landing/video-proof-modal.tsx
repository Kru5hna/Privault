"use client";

import { useEffect, useRef } from "react";
import { PlayCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface VideoProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc: string;
  title?: string;
}

export function VideoProofModal({
  isOpen,
  onClose,
  videoSrc,
  title = "Database Proof — Live Walkthrough",
}: VideoProofModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pause and reset on close so reload is clean. ESC handling
  // and body scroll lock are owned by the shared Modal.
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      zIndex={100}
      noPadding
      showCloseButton={false}
      data-testid="video-proof-modal"
    >
      <div
        className="w-full h-full max-w-6xl flex flex-col bg-[#15161A] border border-white/10 rounded overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <PlayCircle className="w-5 h-5 text-[#E41613] shrink-0" />
            <span className="font-mono text-sm text-white font-bold truncate">
              {title}
            </span>
            <span className="hidden sm:inline-block text-[9px] font-bold tracking-widest text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded shrink-0">
              PUBLIC DB DUMP
            </span>
          </div>
        </div>

        {/* Video Viewport */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-4 sm:p-6 bg-[#0D0E10] relative dotted-grid-dark">
          <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            preload="none"
            playsInline
            className="relative z-10 max-w-full max-h-full rounded shadow-2xl"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    </Modal>
  );
}
