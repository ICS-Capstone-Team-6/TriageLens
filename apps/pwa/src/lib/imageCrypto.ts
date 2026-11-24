// Images at rest (E8-06, NFR-SEC-02, ADR-7): AES-GCM 256 with a key derived from the user's
// PIN by PBKDF2-SHA-256, 600,000 iterations (pwa-offline rule). A fresh random 96-bit IV per
// image, never reused. The key is not extractable and is never stored. The PIN comes from
// offline unlock (E9-03); until then the app stores no images at all.
export const PBKDF2_ITERATIONS = 600_000;

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function deriveImageKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptImage(key: CryptoKey, bytes: ArrayBuffer): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes);
  return { iv, data };
}

/** Throws if the key is wrong or the data was changed (AES-GCM checks integrity). */
export async function decryptImage(key: CryptoKey, iv: Uint8Array, data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data);
}
