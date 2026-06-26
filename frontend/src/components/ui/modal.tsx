"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Visual size of the modal panel.
   *  - "sm":  ~ max-w-sm
   *  - "md":  ~ max-w-md
   *  - "lg":  ~ max-w-lg
   *  - "xl":  ~ max-w-xl
   *  - "2xl": ~ max-w-2xl
   *  - "full":max-w-5xl
   */
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /**
   * Z-index layer. Defaults to 150 (settings/forms).
   * Higher z is reserved for system-level overlays (recovery phrase).
   */
  zIndex?: 100 | 120 | 150 | 160 | 170;
  /**
   * If true (default), clicking the backdrop or pressing ESC closes the modal.
   * Set to false for destructive / once-only flows (e.g. recovery phrase).
   */
  dismissibleByBackdrop?: boolean;
  /**
   * Show the small "×" close button in the top-right corner.
   * Has no effect when dismissibleByBackdrop is false.
   */
  showCloseButton?: boolean;
  /**
   * Disable padding on the inner panel. Useful when the child owns its own
   * padding (e.g. previews that need edge-to-edge imagery).
   */
  noPadding?: boolean;
  /**
   * Optional className for the inner panel (escape hatch for layout-specific
   * styling that does not warrant a new size variant).
   */
  panelClassName?: string;
  /**
   * Test id hook. Defaults to a sensible value; pass to override.
   */
  "data-testid"?: string;
}

const SIZE_MAP: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  full: "max-w-5xl",
};

const Z_MAP: Record<NonNullable<ModalProps["zIndex"]>, string> = {
  100: "z-[100]",
  120: "z-[120]",
  150: "z-[150]",
  160: "z-[160]",
  170: "z-[170]",
};

/**
 * Shared modal wrapper used by all Privault overlays.
 *
 * Centralizes:
 *  - backdrop click-to-close
 *  - ESC key to close
 *  - body scroll lock while open
 *  - consistent z-indexing
 *  - close button placement
 *
 * Per-modal styling (corner badges, layouts, content) lives inside `children`.
 */
export function Modal({
  isOpen,
  onClose,
  children,
  size = "md",
  zIndex = 150,
  dismissibleByBackdrop = true,
  showCloseButton = true,
  noPadding = false,
  panelClassName,
  ...rest
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ── ESC key to close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !dismissibleByBackdrop) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, dismissibleByBackdrop, onClose]);

  // ── Lock body scroll while open ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    // Compensate for the scrollbar disappearing to avoid layout jump.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dismissibleByBackdrop) return;
    // Only close if the user clicked the backdrop itself, not the panel.
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 ${Z_MAP[zIndex]} flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-8`}
      onMouseDown={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      data-testid={rest["data-testid"] ?? "privault-modal"}
    >
      <div
        ref={panelRef}
        className={[
          "relative w-full",
          SIZE_MAP[size],
          "bg-[#111215] border border-white/10 rounded shadow-2xl font-sans",
          "my-auto",
          noPadding ? "" : "p-6 sm:p-8",
          panelClassName ?? "",
        ].join(" ")}
        // Stop click propagation so a click inside the panel doesn't
        // close it (the backdrop's onMouseDown checks target equality).
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showCloseButton && dismissibleByBackdrop && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors cursor-pointer z-10"
          >
            <X size={18} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
