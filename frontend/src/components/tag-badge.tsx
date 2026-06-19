import React from "react";
import { TagMetadata } from "@/lib/api";

interface TagBadgeProps {
  tag: TagMetadata;
  onRemove?: () => void;
}

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  // Ensure the color is a valid hex, fallback to brand crimson
  const bgColor = tag.color && /^#[0-9A-F]{6}$/i.test(tag.color) ? tag.color : "#E41613";
  
  return (
    <span 
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-white whitespace-nowrap"
      style={{ backgroundColor: `${bgColor}80`, border: `1px solid ${bgColor}` }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-white/50 focus:outline-none"
          aria-label={`Remove tag ${tag.name}`}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
