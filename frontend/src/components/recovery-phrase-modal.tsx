"use client";

import React, { useState } from "react";
import { AlertTriangle, Copy, Download, Printer, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface RecoveryPhraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  mnemonic: string;
  username: string;
}

export function RecoveryPhraseModal({
  isOpen,
  onClose,
  mnemonic,
  username,
}: RecoveryPhraseModalProps) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const words = mnemonic.split(" ");

  const handleCopy = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    toast.success("Recovery phrase copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fileContent = `PRIVAULT RECOVERY PHRASE
------------------------
Vault Owner: ${username}
Generated At: ${new Date().toLocaleString()}

12-WORD RECOVERY PHRASE:
${mnemonic}

SAFETY INSTRUCTIONS:
1. Write these 12 words down on physical paper.
2. Store the paper in a secure, fireproof location.
3. NEVER share this recovery phrase with anyone. Privault support will NEVER ask for it.
4. Do not store this phrase in an unencrypted format on your computer or phone.
`;
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Privault - Recovery Phrase.txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Recovery phrase downloaded successfully");
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Privault - Recovery Phrase</title>
          <style>
            body { font-family: monospace; padding: 40px; color: #000; background: #fff; }
            h1 { font-family: serif; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .meta { margin-bottom: 30px; font-size: 14px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
            .word-card { border: 1px solid #000; padding: 15px; text-align: center; font-size: 18px; font-weight: bold; }
            .word-number { font-size: 12px; color: #666; display: block; margin-bottom: 5px; }
            .instructions { font-size: 12px; border-top: 1px solid #000; padding-top: 20px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>PRIVAULT RECOVERY PHRASE</h1>
          <div class="meta">
            <strong>Vault Owner:</strong> ${username}<br/>
            <strong>Generated At:</strong> ${new Date().toLocaleString()}
          </div>
          <div class="grid">
            ${words.map((w, i) => `
              <div class="word-card">
                <span class="word-number">#${i + 1}</span>
                ${w}
              </div>
            `).join("")}
          </div>
          <div class="instructions">
            <h3>SAFETY INSTRUCTIONS:</h3>
            <ol>
              <li>Write these 12 words down on physical paper.</li>
              <li>Store the paper in a secure, fireproof location.</li>
              <li>NEVER share this recovery phrase with anyone. Privault support will NEVER ask for it.</li>
              <li>Do not store this phrase in an unencrypted format on your computer or phone.</li>
            </ol>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 overflow-y-auto py-8">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-[#E41613]/5 blur-[120px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg panel-card p-6 sm:p-10 my-auto">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="font-serif text-xl font-bold tracking-[0.25em] text-[#F5F5F0]">
              SECURE RECOVERY PHRASE
            </span>
            <span className="h-2 w-2 rounded-full bg-[#E41613] animate-pulse"></span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            Write down or download your 12-word seed phrase. You will need this to recover your account if you forget your master password.
          </p>
        </div>

        {/* Mnemonic Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {words.map((word, index) => (
            <div
              key={index}
              className="bg-[#1C1D24] border border-white/5 p-3 rounded flex flex-col items-center justify-center font-mono relative group hover:border-white/10 transition-colors"
            >
              <span className="absolute top-1 left-2 text-[9px] text-white/30 font-semibold">
                #{index + 1}
              </span>
              <span className="text-sm font-bold text-white mt-2 select-all">
                {word}
              </span>
            </div>
          ))}
        </div>

        {/* Warning Panel */}
        <div className="mb-6 border-l-2 border-[#E41613] bg-[#E41613]/10 p-4 rounded-r">
          <div className="flex gap-3 items-start">
            <AlertTriangle className="text-[#E41613] shrink-0 mt-0.5" size={16} />
            <div className="text-xs uppercase tracking-wider text-white/80 leading-relaxed font-semibold">
              <span className="text-[#E41613] font-bold">WARNING:</span> This is a zero-knowledge vault. If you lose your master password AND this recovery phrase, your files are permanently gone. We cannot recover them for you.
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer rounded"
          >
            <Copy size={14} />
            {copied ? "Copied!" : "Copy Phrase"}
          </button>
          
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 border border-white/10 hover:border-white/20 bg-[#E41613]/15 hover:bg-[#E41613]/25 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#E41613] hover:text-white transition-all cursor-pointer rounded"
          >
            <Download size={14} />
            Download Backup
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all cursor-pointer rounded"
          >
            <Printer size={14} />
            Print Phrase
          </button>
        </div>

        {/* Acknowledgment & Confirm */}
        <div className="space-y-6 pt-4 border-t border-white/5">
          <label className="flex items-start gap-3 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 border-white/20 rounded accent-[#E41613] cursor-pointer"
            />
            <span className="text-xs text-white/50 group-hover:text-white transition-colors leading-relaxed">
              I have recorded my 12-word recovery phrase and stored it in a secure, private location. I understand that losing it means losing my data.
            </span>
          </label>

          <button
            onClick={onClose}
            disabled={!acknowledged}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#E41613] disabled:bg-white/5 text-white disabled:text-white/20 text-xs font-bold uppercase tracking-widest transition-all cursor-pointer disabled:cursor-not-allowed rounded"
          >
            <ShieldCheck size={16} />
            Confirm Backup Complete
          </button>
        </div>
      </div>
    </div>
  );
}
