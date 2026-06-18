"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { HERO_DOCUMENTS } from "./data";

export function DocumentConstellation() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative w-[400px] h-[480px] flex items-center justify-center cursor-default"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        className="absolute w-32 h-32 rounded-full bg-[#E41613] blur-[80px]"
        initial={false}
        animate={{
          opacity: isHovered ? 0.3 : 0.05,
          scale: isHovered ? 1.5 : 1,
        }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 40, ease: "linear" }}
      >
        <div className="w-[320px] h-[320px] rounded-full border border-white/[0.04]" />
      </motion.div>

      <motion.div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 55, ease: "linear" }}
      >
        <div className="w-[420px] h-[420px] rounded-full border border-[#E41613]/[0.05] border-dashed" />
      </motion.div>

      {HERO_DOCUMENTS.map((doc, index) => (
        <motion.div
          key={doc.id}
          className="absolute"
          style={{ zIndex: doc.z }}
          initial={false}
          animate={isHovered ? "hover" : "idle"}
          variants={{
            idle: { x: doc.x, y: doc.y, rotate: doc.rot, scale: 1 },
            hover: {
              x: doc.hX,
              y: doc.hY,
              rotate: doc.hRot,
              scale: 1.05,
            },
          }}
          transition={{ type: "spring", stiffness: 150, damping: 20, mass: 1 }}
        >
          <motion.div
            animate={{ y: [-4, 4, -4] }}
            transition={{
              repeat: Infinity,
              duration: 4 + (index % 3),
              ease: "easeInOut",
              delay: index * 0.2,
            }}
            className="w-40 h-52 bg-[#141414]/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col justify-between shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/[0.04] to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/60 tracking-wider">
                {doc.type}
              </div>
              <div className="h-1.5 w-12 bg-white/10 rounded-full" />
            </div>

            <div className="flex-1 mt-6 space-y-2.5 opacity-30">
              <div className="h-1 w-full bg-white/20 rounded-full" />
              <div className="h-1 w-5/6 bg-white/20 rounded-full" />
              <div className="h-1 w-4/6 bg-white/20 rounded-full" />
              <div className="h-1 w-full bg-white/20 rounded-full mt-4" />
              <div className="h-1 w-3/6 bg-white/20 rounded-full" />
            </div>

            <div className="relative mt-auto pt-3 border-t border-white/10">
              <div className="text-[11px] font-medium text-white/90 truncate">
                {doc.name}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {doc.meta.includes("Encrypted") || doc.meta.includes("Secure") ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-[#E41613]" />
                ) : null}
                <div className="text-[9px] text-white/40">{doc.meta}</div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
