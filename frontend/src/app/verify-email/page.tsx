"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiVerifyEmail } from "@/lib/api";

type VerifyState = "loading" | "success" | "error";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setMessage("Missing verification token.");
      return;
    }

    let cancelled = false;

    apiVerifyEmail(token)
      .then((res) => {
        if (!cancelled) {
          setState("success");
          setMessage(res.message);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState("error");
          setMessage(err instanceof Error ? err.message : "Verification failed");
        }
      });

    return () => { cancelled = true; };
  }, [searchParams]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0D0E10] px-4 py-8 sm:px-6 sm:py-12 dotted-grid-dark overflow-hidden">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-30" />
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md panel-card p-6 sm:p-10 text-center">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="font-serif text-2xl font-bold tracking-[0.25em] text-[#F5F5F0]">
            PRIVAULT
          </span>
          <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse" />
        </div>

        {state === "loading" && (
          <div>
            <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-[#E41613] border-t-transparent" />
            <p className="text-sm text-white/50">Verifying your email...</p>
          </div>
        )}

        {state === "success" && (
          <div>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <svg className="h-8 w-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-[0.15em] text-[#F5F5F0]">
              EMAIL VERIFIED
            </h1>
            <p className="mt-4 text-sm text-white/50 leading-relaxed">
              {message || "Your email has been verified. Your vault is fully active."}
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="btn-primary mt-8 w-full border-none cursor-pointer"
            >
              <span className="btn-bg" />
              <span className="btn-text">GO TO VAULT</span>
            </button>
          </div>
        )}

        {state === "error" && (
          <div>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
              <svg className="h-8 w-8 text-[#E41613]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold tracking-[0.15em] text-[#F5F5F0]">
              VERIFICATION FAILED
            </h1>
            <p className="mt-4 text-sm text-white/50 leading-relaxed">
              {message || "The verification link is invalid or expired."}
            </p>
            <Link
              href="/login"
              className="mt-8 inline-block w-full btn-primary border-none cursor-pointer text-center"
            >
              <span className="btn-bg" />
              <span className="btn-text">BACK TO LOGIN</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0D0E10] px-4 py-8 sm:px-6 sm:py-12 dotted-grid-dark overflow-hidden">
        <div className="noise-overlay absolute inset-0 pointer-events-none opacity-30" />
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-[#E41613] border-t-transparent" />
        <p className="text-sm text-white/50">Loading Secure Context...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
