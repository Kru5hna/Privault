"use client";

import React, { useMemo } from "react";
import { HardDrive } from "lucide-react";
import { UsageInfo } from "@/lib/api";

interface StorageMeterProps {
  usage: UsageInfo | null;
  loading?: boolean;
}

/**
 * Sidebar storage meter.
 *
 * Layout (per request): 25 MB ------- 100 MB
 * - Left: used value (white when safe, reddish-orange at >= 75%, red at >= 95%)
 * - Center: thin progress bar that fills 1/4 of total track width as a tick,
 *           then grows reddish-orange past it
 * - Right: quota value
 *
 * Color rules:
 *   <  25%  -> green-ish white  (text-white/60)
 *   <  75%  -> white            (text-white/80)
 *   <  95%  -> reddish orange   (#E41613 with orange tint)
 *   >= 95%  -> red              (#DC2626)
 *
 * No percentages are shown — only the absolute byte values.
 */
export function StorageMeter({ usage, loading }: StorageMeterProps) {
  const view = useMemo(() => {
    if (!usage) return null;

    const used = usage.used_bytes;
    const quota = usage.quota_bytes;
    const pct = quota > 0 ? Math.min(used / quota, 1) : 0;
    const fraction = pct * 100; // 0..100

    const tickPct = 25; // the "1/4" reference point requested by user

    let usedColor: string;
    if (fraction >= 95) usedColor = "text-red-400";
    else if (fraction >= 25) usedColor = "text-[#FF6B35]";
    else usedColor = "text-white/60";

    let barColor: string;
    if (fraction >= 95) barColor = "bg-red-500";
    else if (fraction >= 25) barColor = "bg-[#FF6B35]";
    else barColor = "bg-[#E41613]";

    return {
      usedLabel: formatBytes(used),
      quotaLabel: formatBytes(quota),
      fraction,
      tickPct,
      usedColor,
      barColor,
    };
  }, [usage]);

  if (loading || !view) {
    return (
      <div className="px-4 py-3 border-t border-[#1E2026]">
        <div className="flex items-center justify-between text-[10px] font-bold tracking-widest uppercase text-[#5E626F] mb-2">
          <span className="flex items-center gap-1.5">
            <HardDrive size={11} />
            <span>Storage</span>
          </span>
          <span className="animate-pulse">...</span>
        </div>
        <div className="h-[2px] w-full bg-white/5 rounded-full" />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-[#1E2026]">
      {/* Header */}
      <div className="flex items-center justify-between text-[10px] font-bold tracking-widest uppercase text-[#5E626F] mb-2">
        <span className="flex items-center gap-1.5">
          <HardDrive size={11} />
          <span>Storage</span>
        </span>
        {usage && usage.document_count > 0 && (
          <span>
            {usage.document_count} {usage.document_count === 1 ? "FILE" : "FILES"}
          </span>
        )}
      </div>

      {/* Value row: 25 MB ............. 100 MB */}
      <div className="flex items-baseline justify-between mb-2">
        <span
          className={`font-mono text-xs font-semibold tabular-nums transition-colors duration-300 ${view.usedColor}`}
        >
          {view.usedLabel}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#5E626F]">
          {view.quotaLabel}
        </span>
      </div>

      {/* Bar track */}
      <div className="relative h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
        {/* 1/4 reference tick (always visible at 25%) */}
        <span
          className="absolute top-0 bottom-0 w-px bg-white/20 z-10"
          style={{ left: `${view.tickPct}%` }}
          aria-hidden="true"
        />
        {/* Filled portion */}
        <div
          className={`absolute top-0 left-0 h-full ${view.barColor} transition-all duration-500 ease-out`}
          style={{ width: `${view.fraction}%` }}
          role="progressbar"
          aria-valuenow={Math.round(view.fraction)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

/** Compact byte formatter used by both ends of the meter. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
