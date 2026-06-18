"use client";

import Link from "next/link";
import { useAuth } from "@/app/context";
import { MagneticButton } from "./motion-primitives";

export function CtaActions() {
  const { user } = useAuth();

  return (
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
  );
}
