"use client";

import React, { useState, useEffect, useRef } from "react";

interface ScrambledTextProps {
  text: string;
  delay?: number;
}

export function ScrambledText({ text, delay = 20 }: ScrambledTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [hasIntersected, setHasIntersected] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  // Initialize with random scrambled characters to prevent flashing actual text on screen
  useEffect(() => {
    if (!hasIntersected) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}<>?";
      const initialScrambled = text
        .split("")
        .map(() => chars[Math.floor(Math.random() * chars.length)])
        .join("");
      setDisplayText(initialScrambled);
    }
  }, [text, hasIntersected]);

  // Use IntersectionObserver to play animation only when first visible on screen
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 } // Trigger as soon as 5% of the element is visible
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasIntersected) return;

    let iteration = 0;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+{}<>?";
    const interval = setInterval(() => {
      setDisplayText(() => {
        return text
          .split("")
          .map((char, index) => {
            if (index < iteration) {
              return text[index];
            }
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("");
      });

      if (iteration >= text.length) {
        clearInterval(interval);
      }
      iteration += 1 / 3;
    }, delay);

    return () => clearInterval(interval);
  }, [text, delay, hasIntersected]);

  return (
    <span
      ref={elementRef}
      className="font-mono"
    >
      {displayText}
    </span>
  );
}

