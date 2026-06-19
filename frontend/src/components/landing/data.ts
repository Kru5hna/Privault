export const LANDING_STATS = [
  { value: 0, start: 100, prefix: "", suffix: "", label: "SERVER FILE ACCESS" },
  { value: 0, start: 100, prefix: "", suffix: "", label: "SERVER KEY ACCESS" },
  { value: 256, start: 0, prefix: "AES-", suffix: "", label: "DOCUMENT ENCRYPTION" },
  { value: 2048, start: 0, prefix: "RSA-", suffix: "", label: "VAULT PROTECTION" },
] as const;

export const VAULT_FEATURES = [
  {
    title: "No Server Access",
    desc: "Your files are locked before they leave your device. We couldn't read them even if we tried.",
  },
  {
    title: "Local Cryptography",
    desc: "Everything runs directly in your browser. No extra software needed, just pure web standard security.",
  },
  {
    title: "Military Grade",
    desc: "We use the same encryption standards trusted by governments and financial institutions worldwide.",
  },
  {
    title: "Open & Auditable",
    desc: "Our cryptographic implementations use standard Web Crypto APIs that are built directly into your browser.",
  },
] as const;

export const SECURITY_STRATEGIES = [
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

export const FAQ_ITEMS = [
  {
    question: "How does Privault guarantee my files are secure?",
    answer: "Privault uses client-side, zero-knowledge encryption. Every file is encrypted in your browser using a unique, randomly generated Document Encryption Key (AES-256-GCM) before it is uploaded. The key itself is wrapped with your RSA-2048 public key, ensuring that only your private key can decrypt it.",
  },
  {
    question: "Where are my private keys and password stored?",
    answer: "Your master password and private keys are never stored on our servers. When you log in, your browser derives a Key Encryption Key (KEK) using PBKDF2. This KEK is used locally to decrypt your RSA private key, which is kept strictly in your browser's temporary memory (React state) and discarded when you log out or close the tab.",
  },
  {
    question: "What happens if I forget my master password?",
    answer: "Since we operate under a strict zero-knowledge model, we do not store your password or have access to your recovery keys. If you lose your master password, it is mathematically impossible for us to recover your files. We recommend using a password manager to store your credentials securely.",
  },
  {
    question: "How do shareable links work without compromising my vault?",
    answer: "When you create a share link, a unique link key is generated client-side. The file's Document Encryption Key (DEK) is encrypted with this link key, and the link key is appended to the URL fragment (#). The server only stores the encrypted DEK. Because the fragment (#) is never sent to the server, only someone with the complete URL can decrypt the file.",
  },
  {
    question: "Can the server administrator inspect or tamper with my files?",
    answer: "No. The server only receives and stores raw ciphertexts (encrypted blobs) and wrapped keys. Since the decryption keys are generated and held purely on the client side, even a malicious database administrator or server owner has zero access to your actual plaintext data.",
  },
] as const;
