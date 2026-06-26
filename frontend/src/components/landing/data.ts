export const LANDING_STATS = [
  { value: 0, start: 100, prefix: "", suffix: "", label: "SERVER FILE ACCESS" },
  { value: 0, start: 100, prefix: "", suffix: "", label: "SERVER KEY ACCESS" },
  { value: 256, start: 0, prefix: "AES-", suffix: "", label: "DOCUMENT ENCRYPTION" },
  { value: 2048, start: 0, prefix: "RSA-", suffix: "", label: "VAULT PROTECTION" },
] as const;

export const VAULT_FEATURES = [
  {
    title: "Not Even We Can Read Them",
    desc: "Your files are locked in your browser before touching our servers. A subpoena? A hack? Doesn't matter. There's nothing to seize.",
  },
  {
    title: "No Backdoors. No Exceptions.",
    desc: "Every line of crypto runs in your browser using standard Web Crypto APIs. We can't add a backdoor even if we wanted to — your keys never reach us.",
  },
  {
    title: "Share Without Trusting",
    desc: "Share links where the decryption key lives in the URL fragment. It never touches our servers. Expire them. Limit downloads. Stay in control.",
  },
  {
    title: "Your Password Is The Only Key",
    desc: "Forget your password? Your data is gone forever. That's not a bug — that's the whole point. If we could recover it, so could an attacker.",
  },
] as const;

export const SECURITY_STRATEGIES = [
  {
    num: "01",
    title: "Encrypt Before Upload",
    desc: "AES-256-GCM locks every file in your browser before a single byte leaves for our server. We store ciphertext. That's it.",
  },
  {
    num: "02",
    title: "Every File Gets Its Own Key",
    desc: "A unique Data Encryption Key (DEK) is generated per file, then wrapped with your RSA-2048 public key. One leaked key = one file, not your whole vault.",
  },
  {
    num: "03",
    title: "Dual-Path Password Derivation",
    desc: "Your password derives two independent secrets via PBKDF2 with separate salts. Compromising the auth path doesn't touch your encryption keys.",
  },
  {
    num: "04",
    title: "Session Tokens, Not JWTs",
    desc: "No JWT signing. Login creates a random 32-byte token, SHA-256 hashed before storage. If our DB leaks, sessions can't be forged.",
  },
] as const;

export const HERO_DOCUMENTS = [
  {
    id: 1,
    name: "contract.pdf",
    meta: "2.3 MB - Encrypted",
    type: "PDF",
    x: 0,
    y: 0,
    rot: -4,
    hX: -70,
    hY: -80,
    hRot: -12,
    z: 50,
  },
  {
    id: 2,
    name: "research-notes.docx",
    meta: "Updated 2h ago",
    type: "DOC",
    x: 12,
    y: 8,
    rot: 2,
    hX: 70,
    hY: -40,
    hRot: 10,
    z: 40,
  },
  {
    id: 3,
    name: "startup-plan.pdf",
    meta: "Secure",
    type: "PDF",
    x: -8,
    y: 15,
    rot: -2,
    hX: -80,
    hY: 30,
    hRot: -5,
    z: 30,
  },
  {
    id: 4,
    name: "financial-report.xlsx",
    meta: "1.1 MB",
    type: "XLS",
    x: 18,
    y: 22,
    rot: 6,
    hX: 80,
    hY: 60,
    hRot: 15,
    z: 20,
  },
  {
    id: 5,
    name: "passport-scan.jpg",
    meta: "Encrypted",
    type: "IMG",
    x: -2,
    y: 30,
    rot: -1,
    hX: -30,
    hY: 100,
    hRot: -8,
    z: 10,
  },
] as const;

export const CHALLENGE_STEPS = [
  {
    step: "01",
    title: "Upload a sensitive file",
    desc: "A contract. A passport scan. Your startup's financials. Something you'd never want leaked.",
    highlight: false,
  },
  {
    step: "02",
    title: "See what's in our database",
    desc: "Ciphertext, wrapped keys, and nothing else. We publish exactly what our servers hold — because what we don't store is the only thing that matters.",
    highlight: true,
  },
  {
    step: "03",
    title: "Try to read your file",
    desc: "Go ahead. Run it past every cryptoanalyst you know. All you'll find is AES-256-GCM ciphertext and wrapped keys that only exist in your browser's memory.",
    highlight: false,
  },
] as const;

export const FAQ_ITEMS = [
{
  question: "Can Privault read my files?",
  answer:
    "No. And we can prove it. Your files are encrypted with AES-256-GCM before they leave your browser. The key never touches our servers. If our CTO tried to read your file, they'd see the same thing a hacker would: meaningless ciphertext.",
},
{
  question: "How is this different from Google Drive / Dropbox / iCloud?",
  answer:
    "They claim 'encrypted at rest.' They hold the keys. They can read your files, comply with government requests, and scan your content for ads or AI training. We physically cannot. Your data is locked before it reaches us. There is no 'except with a court order.' There is no 'except for law enforcement.' The key is in your browser, not our database.",
},
{
  question: "What if your servers get hacked?",
  answer:
    "They will get hacked. Every server does eventually. The difference is that our servers store only AES-256-GCM ciphertext and RSA-wrapped keys. Without your password (which never reaches us) and your private key (which never leaves your browser), the data is mathematically unreadable. Hack us. You'll find nothing useful.",
},
{
  question: "What happens if I forget my password?",
  answer:
    "Your data is gone forever. Permanently. Irrecoverably. We cannot reset your password, send a recovery email, or unlock your vault. This is a feature, not a flaw. If we could recover your data, so could a government with a subpoena or a hacker with DB access. Store your password in a trusted manager.",
},
{
  question: "Can I share files securely?",
  answer:
    "Yes. Privault generates share links where the decryption key is embedded in the URL fragment — the part of the URL that never reaches our server. You can set expiration dates and download limits. Even we cannot access the files you share.",
},
{
  question: "Is this open source? Can I audit the code?",
  answer:
    "Yes. Privault is fully open source. The complete codebase is available on GitHub. The cryptographic implementation uses the Web Crypto API — the same standards your browser uses for HTTPS. No custom crypto. No roll-your-own math. You can verify every line.",
},
{
  question: "Can I trust a closed-source alternative like... anything?",
  answer:
    "Every major cloud provider has had data breaches. Google Drive, Dropbox, iCloud — all of them. They can also be legally compelled to hand over your data. With Privault, there's nothing to hand over. The encrypted data is useless without your keys, and we don't have them.",
},
{
  question: "Who should use Privault?",
  answer:
    "Journalists protecting sources. Lawyers with confidentiality obligations. Freelancers storing client NDAs and contracts. Anyone who has ever felt uneasy uploading their passport to a random website. If you have files that would damage you if leaked, you need Privault.",
},
] as const;

