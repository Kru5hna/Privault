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
question: "Can Privault see my files?",
answer:
"No. Your files are encrypted before they leave your device and can only be decrypted by you. Privault stores encrypted data, not readable documents.",
},
{
question: "How is Privault different from Google Drive or Dropbox?",
answer:
"Traditional cloud storage providers can access your files if needed. Privault encrypts files before upload, so even we cannot see, read, or scan the contents of your documents.",
},
{
question: "What happens if I forget my master password?",
answer:
"Because Privault is built around privacy, we cannot recover your master password or unlock your vault for you. We strongly recommend storing it in a trusted password manager.",
},
{
question: "Can I securely share files with other people?",
answer:
"Yes. You can generate secure share links with optional expiration dates and download limits. Anyone with the complete link can access the file without creating an account.",
},
{
question: "What happens if Privault's servers are hacked?",
answer:
"Attackers would only obtain encrypted files. Without the required encryption keys, the contents remain unreadable and cannot be accessed.",
},
{
question: "Are my files encrypted while uploading?",
answer:
"Yes. Files are encrypted in your browser before upload, remain encrypted while being transferred, and stay encrypted while stored on our servers.",
},
{
question: "Can Privault employees access my documents?",
answer:
"No. Decryption happens on your device, not on our servers. Even system administrators cannot view the contents of your files.",
},
{
question: "Who owns my data?",
answer:
"You do. Your files remain your property at all times. Privault never claims ownership of your content and cannot access it.",
},
] as const;

