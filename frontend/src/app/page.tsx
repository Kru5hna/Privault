"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/context";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "framer-motion";
import Lenis from "lenis";

// ── Smooth Scroll Provider ──────────────────────────────────────────────
function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);
}

// ── Interactive Particle Canvas ─────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      baseX: number;
      baseY: number;
      opacity: number;
    }> = [];

    const spacing = 50;
    for (let x = spacing / 2; x < width; x += spacing) {
      for (let y = spacing / 2; y < height; y += spacing) {
        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: 0,
          vy: 0,
          size: 1.5 + Math.random() * 1.5,
          color: `rgba(255, 255, 255, ${0.15 + Math.random() * 0.25})`,
          opacity: 0.15 + Math.random() * 0.25,
        });
      }
    }

    const mouse = { x: -1000, y: -1000, radius: 160 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;

      particles.length = 0;
      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          particles.push({
            x,
            y,
            baseX: x,
            baseY: y,
            vx: 0,
            vy: 0,
            size: 1.5 + Math.random() * 1.5,
            color: `rgba(255, 255, 255, ${0.15 + Math.random() * 0.25})`,
            opacity: 0.15 + Math.random() * 0.25,
          });
        }
      }
    };
    window.addEventListener("resize", handleResize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const distance = Math.hypot(dx, dy);

        if (distance < mouse.radius) {
          const force = (mouse.radius - distance) / mouse.radius;
          const angle = Math.atan2(dy, dx);

          const pullX = Math.cos(angle) * force * 20;
          const pullY = Math.sin(angle) * force * 20;

          p.vx += pullX * 0.12;
          p.vy += pullY * 0.12;

          // Bright crimson glow on proximity
          p.color = `rgba(228, 22, 19, ${0.3 + force * 0.7})`;
          p.size = 1.5 + force * 3;
        } else {
          const homeDx = p.baseX - p.x;
          const homeDy = p.baseY - p.y;
          p.vx += homeDx * 0.04;
          p.vy += homeDy * 0.04;
          p.color = `rgba(255, 255, 255, ${p.opacity})`;
          p.size = 1.5 + Math.random() * 0.3;
        }

        p.vx *= 0.84;
        p.vy *= 0.84;
        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Draw faint connections near cursor
        if (distance < mouse.radius * 1.5) {
          particles.forEach((p2) => {
            const d2 = Math.hypot(p.x - p2.x, p.y - p2.y);
            if (d2 < 80 && d2 > 0) {
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.strokeStyle = `rgba(228, 22, 19, ${0.08 * (1 - d2 / 80)})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          });
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "auto" }}
    />
  );
}

// ── Animated Counter Component ──────────────────────────────────────────
function AnimatedCounter({
  value,
  suffix = "",
  duration = 2,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(eased * value));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [isInView, value, duration]);

  return (
    <span ref={ref}>
      {displayValue}
      {suffix}
    </span>
  );
}

// ── Magnetic Button Component ───────────────────────────────────────────
function MagneticButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
  const springY = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      x.set((e.clientX - centerX) * 0.15);
      y.set((e.clientY - centerY) * 0.15);
    },
    [x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Reveal Text Animation ───────────────────────────────────────────────
function RevealText({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className="overflow-hidden">
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={isInView ? { y: 0, opacity: 1 } : {}}
        transition={{
          duration: 0.8,
          delay,
          ease: [0.76, 0, 0.24, 1],
        }}
        className={className}
      >
        {children}
      </motion.div>
    </div>
  );
}

// ── Fade-Up Section Wrapper ─────────────────────────────────────────────
function FadeUp({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ y: 60, opacity: 0 }}
      animate={isInView ? { y: 0, opacity: 1 } : {}}
      transition={{
        duration: 0.9,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Document Constellation Component (Hero Visual) ──────────────────────
const DOCUMENTS = [
  { id: 1, name: "contract.pdf", meta: "2.3 MB · Encrypted", type: "PDF", x: 0, y: 0, rot: -4, hX: -70, hY: -80, hRot: -12, z: 50 },
  { id: 2, name: "research-notes.docx", meta: "Updated 2h ago", type: "DOC", x: 12, y: 8, rot: 2, hX: 70, hY: -40, hRot: 10, z: 40 },
  { id: 3, name: "startup-plan.pdf", meta: "Secure", type: "PDF", x: -8, y: 15, rot: -2, hX: -80, hY: 30, hRot: -5, z: 30 },
  { id: 4, name: "financial-report.xlsx", meta: "1.1 MB", type: "XLS", x: 18, y: 22, rot: 6, hX: 80, hY: 60, hRot: 15, z: 20 },
  { id: 5, name: "passport-scan.jpg", meta: "Encrypted", type: "IMG", x: -2, y: 30, rot: -1, hX: -30, hY: 100, hRot: -8, z: 10 },
];

function DocumentConstellation() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="relative w-[400px] h-[480px] flex items-center justify-center cursor-default"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Central glowing core that intensifies on hover */}
      <motion.div 
        className="absolute w-32 h-32 rounded-full bg-[#E41613] blur-[80px]"
        initial={false}
        animate={{ opacity: isHovered ? 0.3 : 0.05, scale: isHovered ? 1.5 : 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
      
      {/* Orbital rings */}
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

      {/* The Documents */}
      {DOCUMENTS.map((doc, i) => (
        <motion.div
          key={doc.id}
          className="absolute"
          style={{ zIndex: doc.z }}
          initial={false}
          animate={isHovered ? "hover" : "idle"}
          variants={{
            idle: { x: doc.x, y: doc.y, rotate: doc.rot, scale: 1 },
            hover: { x: doc.hX, y: doc.hY, rotate: doc.hRot, scale: 1.05 }
          }}
          transition={{ type: "spring", stiffness: 150, damping: 20, mass: 1 }}
        >
          <motion.div
            animate={{ y: [-4, 4, -4] }}
            transition={{ repeat: Infinity, duration: 4 + (i % 3), ease: "easeInOut", delay: i * 0.2 }}
            className="w-40 h-52 bg-[#141414]/60 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col justify-between shadow-[0_16px_40px_rgba(0,0,0,0.5)] overflow-hidden relative group"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/[0.04] to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            {/* Top Icon Area */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-white/60 tracking-wider">
                {doc.type}
              </div>
              <div className="h-1.5 w-12 bg-white/10 rounded-full" />
            </div>

            {/* Fake Content Lines */}
            <div className="flex-1 mt-6 space-y-2.5 opacity-30">
              <div className="h-1 w-full bg-white/20 rounded-full" />
              <div className="h-1 w-5/6 bg-white/20 rounded-full" />
              <div className="h-1 w-4/6 bg-white/20 rounded-full" />
              <div className="h-1 w-full bg-white/20 rounded-full mt-4" />
              <div className="h-1 w-3/6 bg-white/20 rounded-full" />
            </div>

            {/* Bottom Info */}
            <div className="relative mt-auto pt-3 border-t border-white/10">
              <div className="text-[11px] font-medium text-white/90 truncate">{doc.name}</div>
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

// ── Scroll Progress Bar ─────────────────────────────────────────────────
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-[2px] bg-[#E41613] z-[100] origin-left"
      style={{ scaleX }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const { user, logout } = useAuth();
  const heroRef = useRef(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  // Parallax transforms for hero elements
  const heroTextY = useTransform(heroScrollProgress, [0, 1], [0, -120]);
  const heroShieldY = useTransform(heroScrollProgress, [0, 1], [0, -60]);
  const heroOverlayOpacity = useTransform(heroScrollProgress, [0, 0.5], [0, 0.4]);

  // Smooth scroll
  useSmoothScroll();

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-white font-sans antialiased">
      {/* Scroll Progress Indicator */}
      <ScrollProgress />

      {/* ── NAVIGATION ──────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
          {/* Left: Micro label */}
          <div className="hidden md:block">
            <span className="text-micro text-[#999]">Secure Vault</span>
          </div>

          {/* Center: PRIVAULT brand */}
          <Link href="/" className="static shrink-0 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            <motion.span
              className="text-brand text-base sm:text-xl md:text-2xl text-white hover:text-[#E41613] transition-colors duration-500"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              Privault
            </motion.span>
          </Link>

          {/* Right: Auth Links */}
          <div className="flex shrink-0 items-center gap-3 sm:gap-6">
            {user ? (
              <>
                <MagneticButton>
                  <Link href="/dashboard" className="btn-primary">
                    <span className="btn-bg" />
                    <span className="btn-text">Dashboard</span>
                  </Link>
                </MagneticButton>
                <button
                  onClick={logout}
                  className="text-micro text-[#999] hover:text-[#E41613] transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-micro text-[#999] hover:text-white transition-colors hidden sm:block"
                >
                  Sign In
                </Link>
                <MagneticButton>
                  <Link href="/register" className="btn-primary">
                    <span className="btn-bg" />
                    <span className="btn-text">Create Vault</span>
                  </Link>
                </MagneticButton>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative min-h-[100svh] flex items-center overflow-hidden bg-[#0A0A0A]"
      >
        {/* Particle Canvas Background */}
        <ParticleCanvas />

        {/* Noise texture overlay */}
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-40" />

        {/* Subtle gradient overlay on scroll */}
        <motion.div
          className="absolute inset-0 bg-black pointer-events-none z-[2]"
          style={{ opacity: heroOverlayOpacity }}
        />

        {/* Giant faded PRIVAULT watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
          <span className="text-brand text-[20vw] text-white/[0.02] select-none whitespace-nowrap">
            PRIVAULT
          </span>
        </div>

        {/* Main hero content */}
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 sm:py-32 md:py-0">
          <div className="grid grid-cols-1 items-center gap-10 pt-16 sm:pt-24 lg:grid-cols-2 lg:gap-16">
            {/* Left: Text */}
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
                    Your <br /> {" "}
                    <span className="text-display-bold text-[#E41613] relative">
                      Rules
                      <motion.span
                        className="absolute -bottom-2 left-0 h-[3px] bg-[#E41613]"
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.8, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
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
                Store private documents in a vault only you can unlock.
                Simple, secure, and built so even we can&apos;t read your files.
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
                    <span className="btn-text">Create Vault</span>
                  </Link>
                </MagneticButton>

                <a href="#about" className="btn-outline w-full sm:w-auto">
                  See How It Works
                  <motion.span
                    className="inline-block"
                    animate={{ y: [0, 4, 0] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  >
                    ↓
                  </motion.span>
                </a>
              </motion.div>
            </motion.div>

            {/* Right: Document Constellation Visual */}
            <motion.div
              className="hidden lg:flex items-center justify-center"
              style={{ y: heroShieldY }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
            >
              <DocumentConstellation />
            </motion.div>
          </div>
        </div>

        {/* Scroll Indicator */}
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

      {/* ── CRIMSON STATS BAND ──────────────────────────────────────── */}
      <section className="relative bg-[#E41613] py-14 sm:py-16 md:py-20 overflow-hidden">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-20" />
        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4 md:gap-12">
            {[
              { value: 0, suffix: "", label: "Readable files stored by us" },
              { value: 100, suffix: "%", label: "Locked before upload" },
              { value: 256, suffix: "", label: "File protection strength" },
              { value: 2048, suffix: "", label: "Vault key protection" },
            ].map((stat, i) => (
              <FadeUp key={stat.label} delay={i * 0.1}>
                <div className="text-center md:text-left">
                  <div className="font-serif text-5xl md:text-6xl font-light text-white">
                    <AnimatedCounter
                      value={stat.value}
                      suffix={stat.suffix}
                      duration={2}
                    />
                  </div>
                  <div className="text-micro text-white/60 mt-3">
                    {stat.label}
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT / MISSION SECTION ─────────────────────────────────── */}
      <section
        id="about"
        className="relative py-16 sm:py-28 md:py-40 bg-[#0A0A0A] overflow-hidden dotted-grid-dark"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-16">
            {/* Left column: label + line */}
            <div className="lg:col-span-4">
              <FadeUp>
                <p className="text-label text-[#E41613] mb-6">Core Mission</p>
              </FadeUp>
              <FadeUp delay={0.15}>
                <div className="w-16 h-[1px] bg-white/20" />
              </FadeUp>
            </div>

            {/* Right column: statement */}
            <div className="lg:col-span-8">
              <FadeUp delay={0.2}>
                <h2 className="text-display text-[clamp(2rem,4vw,3.5rem)] text-white/90 leading-[1.15]">
                  A secure workspace built on{" "}
                  <span className="text-[#E41613] italic font-serif font-normal">
                    absolute privacy.
                  </span>{" "}
                  Only you can open what you store. Your documents never touch our
                  servers unencrypted.
                </h2>
              </FadeUp>
              <FadeUp delay={0.35}>
                <p className="mt-8 text-base text-white/40 font-light leading-relaxed max-w-xl">
                  Founded in 2026, Privault was built so even we can't read your files.
                  When you upload a document, it gets locked directly in your browser.
                  Your private keys are managed locally on your device, ensuring total
                  control and complete peace of mind.
                </p>
              </FadeUp>
              <FadeUp delay={0.45}>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 mt-8 text-micro text-white/60 hover:text-[#E41613] transition-colors group"
                >
                  Start encrypting today
                  <span className="inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </FadeUp>
            </div>
          </div>
        </div>
      </section>

      {/* ── SPECS / METRICS SECTION ─────────────────────────────────── */}
      <section id="metrics" className="relative py-16 sm:py-28 md:py-32 bg-[#111111] border-y border-white/5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-16">
            {/* Left: Description */}
            <div className="lg:col-span-5">
              <FadeUp>
                <p className="text-label text-white/40 mb-4">Specifications</p>
              </FadeUp>
              <FadeUp delay={0.1}>
                <h3 className="font-serif text-3xl md:text-4xl font-light text-white mb-6">
                  Your Vault,
                  <br />
                  <span className="text-[#E41613]">Your Keys</span>
                </h3>
              </FadeUp>
              <FadeUp delay={0.2}>
                <p className="text-sm text-white/40 font-light leading-relaxed mb-8">
                  Every locking operation happens seamlessly inside your browser.
                  Your master password never leaves your device, keeping you in complete
                  control. It's private document storage that feels simple.
                </p>
              </FadeUp>
              <FadeUp delay={0.3}>
                <MagneticButton>
                  <Link href="/register" className="btn-primary">
                    <span className="btn-bg" />
                    <span className="btn-text">Create Secure Vault</span>
                  </Link>
                </MagneticButton>
              </FadeUp>
            </div>

            {/* Right: Metric Grid */}
            <div className="lg:col-span-7">
              <div className="grid grid-cols-1 gap-[1px] bg-white/5 border border-white/5 overflow-hidden sm:grid-cols-2">
                {[
                  { title: "No Server Access", desc: "Your files are locked before they leave your device. We couldn't read them even if we tried." },
                  { title: "Local Cryptography", desc: "Everything runs directly in your browser. No extra software needed, just pure web standard security." },
                  { title: "Military Grade", desc: "We use the same encryption standards trusted by governments and financial institutions worldwide." },
                  { title: "Open & Auditable", desc: "Our cryptographic implementations use standard Web Crypto APIs that are built directly into your browser." },
                ].map((feature, i) => (
                  <FadeUp key={feature.title} delay={i * 0.12}>
                    <div className="bg-[#111111] p-6 sm:p-8 md:p-10 hover:bg-white/[0.02] transition-colors duration-500 group h-full">
                      <div className="h-2 w-2 rounded-full bg-[#E41613] mb-6 group-hover:scale-150 transition-transform duration-500" />
                      <div className="font-serif text-xl font-light text-white mb-3 group-hover:text-[#E41613] transition-colors duration-500">
                        {feature.title}
                      </div>
                      <div className="text-sm text-white/40 font-light leading-relaxed">
                        {feature.desc}
                      </div>
                    </div>
                  </FadeUp>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STRATEGIES / FEATURES SECTION ───────────────────────────── */}
      <section
        id="features"
        className="relative py-16 sm:py-28 md:py-40 bg-[#0A0A0A] overflow-hidden"
      >
        {/* Subtle background grid */}
        <div className="absolute inset-0 dotted-grid-dark opacity-60" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-12 max-w-3xl sm:mb-20">
            <FadeUp>
              <p className="text-label text-[#E41613] mb-4">
                Cryptographic Strategies
              </p>
            </FadeUp>
            <FadeUp delay={0.1}>
              <h2 className="font-serif text-3xl md:text-5xl font-light text-white leading-tight">
                Simple concepts,{" "}
                <span className="italic text-[#E41613]">robust <br></br></span>{" "}
                protection across all your documents.
              </h2>
            </FadeUp>
          </div>

          {/* Strategy Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: "01",
                title: "Pre-Upload Locks",
                desc: "Your files are mathematically scrambled directly on your device before they even begin uploading.",
              },
              {
                num: "02",
                title: "Personal Key Set",
                desc: "We generate a unique master key just for you. Every single file gets its own uncrackable lock, and only your key fits.",
              },
              {
                num: "03",
                title: "Zero-Knowledge",
                desc: "We never store your real password. We mathematically verify your identity without ever learning your secret.",
              },
              {
                num: "04",
                title: "Complete Control",
                desc: "Everything from searching to opening your documents happens privately on your screen. Nothing leaks.",
              },
            ].map((card, i) => (
              <FadeUp key={card.num} delay={i * 0.12}>
                <motion.div
                  className="group relative border border-white/10 bg-white/[0.02] p-6 sm:p-8 h-full transition-all duration-500 hover:border-[#E41613]/50 overflow-hidden"
                  whileHover={{ y: -6, transition: { duration: 0.3 } }}
                >
                  {/* Red accent bar on hover */}
                  <motion.span
                    className="absolute top-0 left-0 w-[3px] h-full bg-[#E41613]"
                    initial={{ scaleY: 0 }}
                    whileHover={{ scaleY: 1 }}
                    transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}
                    style={{ originY: 0 }}
                  />

                  <div className="text-micro text-white/30 mb-8">
                    Strategy {card.num}
                  </div>
                  <h3 className="font-serif text-xl font-normal text-white mb-4 group-hover:text-[#E41613] transition-colors duration-300">
                    {card.title}
                  </h3>
                  <p className="text-sm text-white/35 leading-relaxed font-light">
                    {card.desc}
                  </p>

                  {/* Bottom shimmer line on hover */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#E41613]/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </motion.div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA SECTION ─────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-28 md:py-40 bg-[#0A0A0A] border-t border-white/5 overflow-hidden">
        {/* Large background text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-brand text-[15vw] text-white/[0.02] select-none whitespace-nowrap">
            ENCRYPTED
          </span>
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6">
          <FadeUp>
            <p className="text-label text-[#E41613] mb-6">Get Started</p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-6xl font-light text-white leading-tight mb-8">
              Your privacy is not
              <br />
              <span className="italic text-[#E41613]">negotiable.</span>
            </h2>
          </FadeUp>
          <FadeUp delay={0.2}>
            <p className="text-base text-white/40 font-light leading-relaxed mb-12 max-w-lg mx-auto">
              Create your encrypted vault in seconds. No credit card, no
              tracking, no compromises. Just pure client-side security.
            </p>
          </FadeUp>
          <FadeUp delay={0.3}>
            <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
              <MagneticButton>
                <Link
                  href={user ? "/dashboard" : "/register"}
                  className="btn-primary w-full !py-4 sm:w-auto sm:!px-10"
                >
                  <span className="btn-bg" />
                  <span className="btn-text">Create Your Vault</span>
                </Link>
              </MagneticButton>
              <Link
                href="/login"
                className="btn-outline w-full !text-white/40 border-white/10 sm:w-auto"
              >
                Sign in to existing vault
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="bg-[#050505] border-t border-white/5 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-brand text-lg text-white">Privault</span>
                <span className="h-2 w-2 bg-[#E41613]" />
              </div>
              <p className="text-xs text-white/30 font-light leading-relaxed max-w-xs">
                Zero-knowledge document security. Built with browser-native
                cryptography for absolute privacy.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-10 sm:gap-16">
              <div>
                <p className="text-micro text-white/50 mb-4">Product</p>
                <div className="flex flex-col gap-3">
                  <a
                    href="#about"
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    About
                  </a>
                  <a
                    href="#metrics"
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Specifications
                  </a>
                  <a
                    href="#features"
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Strategies
                  </a>
                </div>
              </div>
              <div>
                <p className="text-micro text-white/50 mb-4">Access</p>
                <div className="flex flex-col gap-3">
                  <Link
                    href="/login"
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="text-xs text-white/30 hover:text-white transition-colors"
                  >
                    Create Vault
                  </Link>
                </div>
              </div>
            </div>

            {/* Badge */}
            <div className="flex md:justify-end">
              <div className="inline-flex max-w-full items-center gap-3 border border-white/10 px-4 py-3 sm:px-5">
                <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
                <span className="text-micro text-white/40 leading-relaxed">
                  E2EE Active · Zero Knowledge
                </span>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div className="text-[10px] text-white/20 tracking-wider">
              © 2026 PRIVAULT. All rights reserved.
            </div>
            <div className="text-[10px] text-white/20 tracking-wider">
              AES-256-GCM · RSA-2048-OAEP · PBKDF2 · WebCrypto API
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
