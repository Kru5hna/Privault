"use client";

import { motion } from "framer-motion";
import type { SECURITY_STRATEGIES } from "./data";

type Strategy = (typeof SECURITY_STRATEGIES)[number];

export function StrategyCard({ card }: { card: Strategy }) {
  return (
    <motion.div
      className="group relative border border-white/10 bg-white/[0.02] p-6 sm:p-8 h-full transition-all duration-500 hover:border-[#E41613]/50 overflow-hidden"
      whileHover={{ y: -6, transition: { duration: 0.3 } }}
    >
      <motion.span
        className="absolute top-0 left-0 w-[3px] h-full bg-[#E41613]"
        initial={{ scaleY: 0 }}
        whileHover={{ scaleY: 1 }}
        transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
        style={{ originY: 0 }}
      />

      <div className="text-micro text-white/30 mb-8">Strategy {card.num}</div>
      <h3 className="font-serif text-xl font-normal text-white mb-4 group-hover:text-[#E41613] transition-colors duration-300">
        {card.title}
      </h3>
      <p className="text-sm text-white/35 leading-relaxed font-light">
        {card.desc}
      </p>

      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#E41613]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </motion.div>
  );
}
