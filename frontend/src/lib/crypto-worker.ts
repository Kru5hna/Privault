export function createCryptoWorker() {
  if (typeof window === "undefined") return null;
  return new Worker(new URL("../workers/crypto.worker.ts", import.meta.url));
}

export async function encryptFileInWorker(
  fileBytes: Uint8Array,
  rsaPublicKey: CryptoKey
): Promise<{ ciphertext: Uint8Array; encryptedDek: string }> {
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", rsaPublicKey);

  return new Promise((resolve, reject) => {
    const worker = createCryptoWorker();
    if (!worker) {
      reject(new Error("Web Workers not available"));
      return;
    }

    worker.onmessage = (e) => {
      worker.terminate();
      const { type, payload } = e.data;
      if (type === "encrypted") {
        resolve({
          ciphertext: new Uint8Array(payload.ciphertext),
          encryptedDek: payload.encryptedDek,
        });
      } else {
        reject(new Error(payload?.message || "Encryption failed in worker"));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(
      {
        type: "encrypt",
        payload: {
          fileBytes: fileBytes.buffer,
          publicKeyJwk,
        },
      },
      [fileBytes.buffer]
    );
  });
}

export async function decryptFileInWorker(
  encryptedPayload: Uint8Array,
  encryptedDekBase64: string,
  rsaPrivateKey: CryptoKey
): Promise<Uint8Array> {
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", rsaPrivateKey);

  return new Promise((resolve, reject) => {
    const worker = createCryptoWorker();
    if (!worker) {
      reject(new Error("Web Workers not available"));
      return;
    }

    worker.onmessage = (e) => {
      worker.terminate();
      const { type, payload } = e.data;
      if (type === "decrypted") {
        resolve(new Uint8Array(payload.decryptedBytes));
      } else {
        reject(new Error(payload?.message || "Decryption failed in worker"));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage(
      {
        type: "decrypt",
        payload: {
          encryptedPayload: encryptedPayload.buffer,
          encryptedDekBase64,
          privateKeyJwk,
        },
      },
      [encryptedPayload.buffer]
    );
  });
}
