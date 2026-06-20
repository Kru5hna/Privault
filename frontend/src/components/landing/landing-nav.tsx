"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/app/context";
import { MagneticButton } from "./motion-primitives";

export function LandingNav() {
  const { user, logout } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <div className="hidden md:flex items-center gap-8">
          <a href="/security" className="text-micro text-[#999] hover:text-white transition-colors">
            Security
          </a>
          <a href="#faq" className="text-micro text-[#999] hover:text-white transition-colors">
            FAQ
          </a>
        </div>

        <Link
          href="/"
          className="static shrink-0 sm:absolute sm:left-1/2 sm:-translate-x-1/2"
        >
          <motion.span
            className="text-brand text-base sm:text-xl md:text-2xl text-white hover:text-[#E41613] transition-colors duration-500"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            Privault
          </motion.span>
        </Link>

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
  );
}
