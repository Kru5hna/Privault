"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useAuth } from "@/app/context";
import { DocumentConstellation } from "./document-constellation";
import { MagneticButton, RevealText } from "./motion-primitives";
import { ParticleCanvas } from "./particle-canvas";

export function LandingHero() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const heroVisualY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.5], [0, 0.4]);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[100svh] flex items-center overflow-hidden bg-[#0A0A0A]"
    >
      <ParticleCanvas />
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-40" />

      <motion.div
        className="absolute inset-0 bg-black pointer-events-none z-[2]"
        style={{ opacity: overlayOpacity }}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
        <span className="text-brand text-[20vw] text-white/[0.02] select-none whitespace-nowrap">
          PRIVAULT
        </span>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-32 md:py-0">
        <div className="grid grid-cols-1 items-center gap-10 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-16">
          <motion.div style={{ y: heroTextY }}>
            <motion.p
              className="text-label text-[#E41613] mb-8"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Private Document Vault
            </motion.p>

            <h1 className="text-display text-[clamp(2.75rem,16vw,8rem)] sm:text-[clamp(3.3rem,7vw,7rem)] text-white mb-0">
              <RevealText delay={0.4}>
                <span className="block">Your Files,</span>
              </RevealText>
              <RevealText delay={0.55}>
                <span className="block">
                  Your <br />{" "}
                  <span className="text-display-bold text-[#E41613] relative">
                    Rules
                    <motion.span
                      className="absolute -bottom-2 left-0 h-[3px] bg-[#E41613]"
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: 0.8,
                        delay: 1.0,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </span>
                </span>
              </RevealText>
            </h1>

            <motion.p
              className="mt-8 max-w-md text-sm sm:text-base md:text-lg text-white/50 font-light leading-relaxed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.0 }}
            >
              Store private documents in a vault only you can unlock. Simple,
              secure, and built so even we can&apos;t read your files.
            </motion.p>

            <motion.div
              className="mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.2 }}
            >
              <MagneticButton>
                <Link
                  href={user ? "/dashboard" : "/register"}
                  className="btn-primary w-full sm:w-auto"
                >
                  <span className="btn-bg" />
                  <span className="btn-text">{user ? "Go to Dashboard" : "Create Vault"}</span>
                </Link>
              </MagneticButton>

              <a href="#about" className="btn-outline w-full sm:w-auto">
                See How It Works
                <motion.span
                  className="inline-block"
                  animate={{ y: [0, 4, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                >
                  &darr;
                </motion.span>
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            className="hidden lg:flex items-center justify-center"
            style={{ y: heroVisualY }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
          >
            <DocumentConstellation />
          </motion.div>
        </div>
      </div>

      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <span className="text-micro text-white/30">Scroll</span>
        <motion.div
          className="w-[1px] h-8 bg-gradient-to-b from-white/40 to-transparent"
          animate={{ scaleY: [1, 0.5, 1], opacity: [0.6, 0.2, 0.6] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}
