import Link from "next/link";

const THREAT_COVERED = [
  "Server compromise (hacker gets DB access)",
  "Government subpoena (legal request for data)",
  "Insider threat (rogue employee)",
  "Network interception (MITM attack)",
];

const THREAT_NOT_COVERED = [
  "Compromised device (malware on your computer)",
  "Password reuse (same password elsewhere)",
  "Phishing (you give away your password)",
];

const STORED_DATA = [
  { item: "File contents", format: "AES-256-GCM ciphertext", readable: "No" },
  { item: "File encryption keys (DEKs)", format: "RSA-2048 OAEP wrapped", readable: "No" },
  { item: "Your RSA private key", format: "AES-GCM wrapped with your KEK", readable: "No" },
  { item: "Your password", format: "Argon2id hash of PBKDF2 hash", readable: "No" },
  { item: "Session token", format: "SHA-256 hash", readable: "No" },
  { item: "Share link key", format: "Never sent — stays in URL fragment", readable: "No" },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans antialiased">
      <div className="mx-auto max-w-4xl px-4 py-24 sm:px-6 sm:py-32">
        <Link href="/" className="text-micro text-[#999] hover:text-white transition-colors">
          &larr; Back to Privault
        </Link>

        <h1 className="text-display text-[clamp(2.5rem,6vw,5rem)] text-white mt-12 mb-4">
          Security
        </h1>
        <p className="text-lg text-white/40 font-light mb-16 max-w-2xl">
          Not &ldquo;we take your privacy seriously.&rdquo; Not &ldquo;encrypted
          at rest.&rdquo; Here is exactly what we store, exactly what we can
          read, and exactly what happens if everything goes wrong.
        </p>

        <section className="mb-20">
          <h2 className="font-serif text-2xl text-white mb-8">Threat Model</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="border border-white/10 p-6">
              <h3 className="text-label text-green-400 mb-4">Protected Against</h3>
              <ul className="space-y-3">
                {THREAT_COVERED.map((t) => (
                  <li key={t} className="text-sm text-white/60 font-light flex items-start gap-3">
                    <span className="text-green-400 mt-0.5">&#10003;</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-label text-[#E41613] mb-4">NOT Protected Against</h3>
              <ul className="space-y-3">
                {THREAT_NOT_COVERED.map((t) => (
                  <li key={t} className="text-sm text-white/60 font-light flex items-start gap-3">
                    <span className="text-[#E41613] mt-0.5">&#10007;</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-sm text-white/30 font-light">
            We protect against server-side threats. We do not protect against
            client-side compromise. If your device has malware, no encryption
            can save you.
          </p>
        </section>

        <section className="mb-20">
          <h2 className="font-serif text-2xl text-white mb-8">What We Store</h2>

          <div className="border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="text-left p-4 text-white/60 font-medium">Data</th>
                  <th className="text-left p-4 text-white/60 font-medium">Format</th>
                  <th className="text-left p-4 text-white/60 font-medium">Can We Read It?</th>
                </tr>
              </thead>
              <tbody>
                {STORED_DATA.map((row, i) => (
                  <tr key={row.item} className={i < STORED_DATA.length - 1 ? "border-b border-white/5" : ""}>
                    <td className="p-4 text-white/80">{row.item}</td>
                    <td className="p-4 text-white/40 font-light font-mono text-xs">{row.format}</td>
                    <td className="p-4 text-green-400">{row.readable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="font-serif text-2xl text-white mb-8">Key Architecture</h2>

          <div className="space-y-6">
            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">1. Registration</h3>
              <p className="text-sm text-white/40 font-light">
                Your browser generates two independent salts (auth_salt, kek_salt).
                Password + auth_salt &rarr; PBKDF2 &rarr; SHA-256 &rarr; auth verifier (sent to server).
                Password + kek_salt &rarr; PBKDF2 &rarr; AES-256-GCM key (KEK, stays in browser).
                RSA-2048 keypair generated in browser. Private key wrapped with KEK,
                sent to server. Server re-hashes auth verifier with Argon2id before storing.
              </p>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">2. Login</h3>
              <p className="text-sm text-white/40 font-light">
                Client fetches salts from server. Re-derives auth verifier. Server
                verifies against Argon2id hash. Server generates random 32-byte
                session token, SHA-256 hashes it, stores in DB. Returns raw token
                + wrapped private key. Client derives KEK, unwraps private key in
                memory (non-extractable). Server never sees the password or the KEK.
              </p>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">3. File Upload</h3>
              <p className="text-sm text-white/40 font-light">
                Browser generates random AES-256-GCM Data Encryption Key (DEK).
                Encrypts file with DEK. Wraps DEK with RSA public key. Sends
                ciphertext + wrapped DEK to server. Server stores on disk.
                Plaintext never leaves your device.
              </p>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">4. Share Links</h3>
              <p className="text-sm text-white/40 font-light">
                Owner unwraps DEK with RSA private key. Generates random symmetric
                Link Key. Re-wraps DEK with Link Key. Link Key placed in URL fragment
                (#) — never sent to server. Recipient opens URL, browser extracts
                Link Key from fragment, unwraps DEK, decrypts file. Server cannot
                access the file even with full DB access.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="font-serif text-2xl text-white mb-8">Proof</h2>

          <div className="border border-white/10 p-6 space-y-4">
            <p className="text-sm text-white/40 font-light">
              Every line of code is open for inspection. No proprietary crypto.
              No &ldquo;trust us.&rdquo; Just standard Web Crypto API, standard
              Rust libraries, and a deliberately transparent architecture.
            </p>
            <a
              href="https://github.com/kru5hna/privault"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#E41613] hover:text-white transition-colors font-mono"
            >
              <span>GitHub</span>
              <span>&rarr;</span>
            </a>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-white mb-8">FAQ</h2>

          <div className="space-y-6">
            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">What if your servers are hacked?</h3>
              <p className="text-sm text-white/40 font-light">
                Attackers obtain AES-256-GCM ciphertext and RSA-wrapped keys.
                Without your password (which we never see) and your private key
                (which never leaves your browser), the data is unreadable.
              </p>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">What if a government subpoenas you?</h3>
              <p className="text-sm text-white/40 font-light">
                We would produce encrypted ciphertext and wrapped keys. We cannot
                decrypt them. The architecture makes compliance impossible, not
                just difficult.
              </p>
            </div>

            <div className="border border-white/10 p-6">
              <h3 className="text-white font-medium mb-2">What if I lose my password?</h3>
              <p className="text-sm text-white/40 font-light">
                Your data is permanently lost. There is no recovery mechanism.
                This is by design — any recovery mechanism is a backdoor. Use a
                password manager.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-20 pt-10 border-t border-white/5 text-center">
          <Link
            href="/register"
            className="btn-primary inline-flex"
          >
            <span className="btn-bg" />
            <span className="btn-text">Create Your Vault</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
