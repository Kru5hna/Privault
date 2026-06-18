import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-[#050505] border-t border-white/5 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 items-start">
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

          <div className="flex md:justify-end">
            <div className="inline-flex max-w-full items-center gap-3 border border-white/10 px-4 py-3 sm:px-5">
              <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-micro text-white/40 leading-relaxed">
                E2EE Active - Zero Knowledge
              </span>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-center gap-4 text-center md:text-left">
          <div className="text-[10px] text-white/20 tracking-wider">
            &copy; 2026 PRIVAULT. All rights reserved.
          </div>
          {/* <div className="text-[10px] text-white/20 tracking-wider">
            AES-256-GCM - RSA-2048-OAEP - PBKDF2 - WebCrypto API
          </div> */}
        </div>
      </div>
    </footer>
  );
}
