type WorkerCtx = {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const ctx = self as unknown as WorkerCtx;

ctx.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case "encrypt": {
        const { fileBytes, publicKeyJwk } = payload;

        const rsaPublicKey = await crypto.subtle.importKey(
          "jwk",
          publicKeyJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["encrypt", "wrapKey"]
        );

        const dek = await crypto.subtle.generateKey(
          { name: "AES-GCM", length: 256 },
          true,
          ["encrypt", "decrypt"]
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          dek,
          fileBytes as BufferSource
        );

        const wrappedDek = await crypto.subtle.wrapKey(
          "raw",
          dek,
          rsaPublicKey,
          { name: "RSA-OAEP" }
        );

        const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encryptedBuffer), iv.length);

        ctx.postMessage(
          {
            type: "encrypted",
            payload: {
              ciphertext: combined.buffer,
              encryptedDek: arrayBufferToBase64(wrappedDek),
            },
          },
          [combined.buffer]
        );
        break;
      }

      case "decrypt": {
        const { encryptedPayload, encryptedDekBase64, privateKeyJwk } = payload;

        const rsaPrivateKey = await crypto.subtle.importKey(
          "jwk",
          privateKeyJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["decrypt", "unwrapKey"]
        );

        const wrappedDek = base64ToUint8Array(encryptedDekBase64);
        const dek = await crypto.subtle.unwrapKey(
          "raw",
          wrappedDek as BufferSource,
          rsaPrivateKey,
          { name: "RSA-OAEP" },
          { name: "AES-GCM", length: 256 },
          true,
          ["decrypt"]
        );

        const iv = encryptedPayload.slice(0, 12);
        const ciphertext = encryptedPayload.slice(12);

        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          dek,
          ciphertext as BufferSource
        );

        ctx.postMessage(
          {
            type: "decrypted",
            payload: { decryptedBytes: decrypted },
          },
          [decrypted]
        );
        break;
      }

      case "importKeyAndDecrypt": {
        const { reEncryptedDekBase64, linkKeyBase64 } = payload;

        const linkKeyBytes = base64ToUint8Array(linkKeyBase64);
        const linkKey = await crypto.subtle.importKey(
          "raw",
          linkKeyBytes as BufferSource,
          { name: "AES-GCM", length: 256 },
          true,
          ["unwrapKey"]
        );

        const combined = base64ToUint8Array(reEncryptedDekBase64);
        const iv = combined.slice(0, 12);
        const wrappedDekBytes = combined.slice(12);

        const dek = await crypto.subtle.unwrapKey(
          "raw",
          wrappedDekBytes as BufferSource,
          linkKey,
          { name: "AES-GCM", iv: iv as BufferSource },
          { name: "AES-GCM", length: 256 },
          true,
          ["decrypt"]
        );

        ctx.postMessage({ type: "dekReady", payload: { dekJwk: await crypto.subtle.exportKey("jwk", dek) } });
        break;
      }

      default:
        ctx.postMessage({ type: "error", payload: { message: `Unknown message type: ${type}` } });
    }
  } catch (err: unknown) {
    ctx.postMessage({ type: "error", payload: { message: err instanceof Error ? err.message : "Crypto worker error" } });
  }
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
