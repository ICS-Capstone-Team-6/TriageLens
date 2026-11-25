// End-to-end encryption for referral images (E10-07, ADR-28 section 4). The server only
// ever stores ciphertext; it cannot read the image or the heatmap.
//
// Keys:
//  - Each facility has one ECDH P-256 key pair. The public key is shared so any clinic can
//    encrypt for it. The private key is stored on the server only wrapped with the
//    facility passphrase (PBKDF2-SHA-256, 600 000 rounds, then AES-GCM). Staff type the
//    passphrase once per phone; the unwrapped key stays non-extractable in this browser.
//  - Each referral gets a fresh random AES-256-GCM content key. The image and heatmap are
//    encrypted with it (12-byte random IV in front of the ciphertext).
//  - The content key is wrapped separately for the receiving and the sending facility:
//    a one-time ECDH key pair, ECDH with the facility public key, HKDF-SHA-256, then
//    AES-GCM. Only someone holding that facility's private key can unwrap it.
// WebCrypto only; no extra library. Tested in crypto.test.ts (Node has the same API).

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
export const PBKDF2_ROUNDS = 600_000;
const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INFO = enc.encode('triagelens-referral-image-key-v1');

export interface WrappedPrivateKey { v: 1; salt: string; iv: string; ct: string; rounds: number }
export interface WrappedContentKey { v: 1; epk: JsonWebKey; iv: string; ct: string }

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** A passphrase must be long enough to resist guessing if the wrapped key leaks. */
export function passphraseProblem(p: string): 'too_short' | null {
  return p.trim().length < 12 ? 'too_short' : null;
}

async function passphraseKey(passphrase: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** New facility key pair: the public JWK to publish and the private key wrapped with the passphrase. */
export async function createFacilityKey(passphrase: string, rounds = PBKDF2_ROUNDS): Promise<{ publicKey: JsonWebKey; wrapped: WrappedPrivateKey }> {
  const pair = await subtle.generateKey(CURVE, true, ['deriveBits']) as CryptoKeyPair;
  const publicKey = await subtle.exportKey('jwk', pair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
  const salt = random(16);
  const iv = random(12);
  const kek = await passphraseKey(passphrase, salt, rounds);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, kek, pkcs8);
  return { publicKey, wrapped: { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), rounds } };
}

/** Unwraps the facility private key. Throws on a wrong passphrase (AES-GCM tag check). */
export async function unlockFacilityKey(wrapped: WrappedPrivateKey, passphrase: string): Promise<CryptoKey> {
  const kek = await passphraseKey(passphrase, unb64(wrapped.salt), wrapped.rounds);
  const pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(wrapped.iv) }, kek, unb64(wrapped.ct));
  return subtle.importKey('pkcs8', pkcs8, CURVE, false, ['deriveBits']);
}

async function sharedKey(priv: CryptoKey, pub: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
  const bits = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256);
  const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: INFO }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** A fresh content key for one referral (raw bytes, wrapped before it leaves the phone). */
export function newContentKey(): Uint8Array {
  return random(32);
}

export async function wrapContentKey(contentKey: Uint8Array, facilityPublic: JsonWebKey): Promise<WrappedContentKey> {
  const pub = await subtle.importKey('jwk', facilityPublic, CURVE, false, []);
  const eph = await subtle.generateKey(CURVE, true, ['deriveBits']) as CryptoKeyPair;
  const epk = await subtle.exportKey('jwk', eph.publicKey);
  const iv = random(12);
  // The HKDF salt is the IV: unique per wrap, and stored anyway.
  const k = await sharedKey(eph.privateKey, pub, iv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, contentKey);
  return { v: 1, epk: { kty: epk.kty, crv: epk.crv, x: epk.x, y: epk.y }, iv: b64(iv), ct: b64(ct) };
}

export async function unwrapContentKey(w: WrappedContentKey, facilityPrivate: CryptoKey): Promise<Uint8Array> {
  const epk = await subtle.importKey('jwk', w.epk, CURVE, false, []);
  const iv = unb64(w.iv);
  const k = await sharedKey(facilityPrivate, epk, iv);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, k, unb64(w.ct)));
}

async function contentCryptoKey(raw: Uint8Array, use: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return subtle.importKey('raw', raw, 'AES-GCM', false, [use]);
}

/** IV (12 bytes) followed by AES-GCM ciphertext. */
export async function encryptBlob(data: ArrayBuffer, contentKey: Uint8Array): Promise<Uint8Array> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await contentCryptoKey(contentKey, 'encrypt'), data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

/** Throws if the data was changed or the key is wrong. */
export async function decryptBlob(data: ArrayBuffer | Uint8Array, contentKey: Uint8Array): Promise<ArrayBuffer> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 13) throw new Error('too short');
  return subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await contentCryptoKey(contentKey, 'decrypt'), bytes.slice(12));
}

export function isWrappedPrivateKey(v: unknown): v is WrappedPrivateKey {
  const w = v as Partial<WrappedPrivateKey> | null;
  return !!w && w.v === 1 && typeof w.salt === 'string' && typeof w.iv === 'string' && typeof w.ct === 'string' &&
    Number.isInteger(w.rounds) && (w.rounds as number) >= 100_000;
}

export function isWrappedContentKey(v: unknown): v is WrappedContentKey {
  const w = v as Partial<WrappedContentKey> | null;
  return !!w && w.v === 1 && !!w.epk && typeof w.epk === 'object' && w.epk.crv === 'P-256' &&
    typeof w.iv === 'string' && typeof w.ct === 'string';
}

export function isPublicJwk(v: unknown): v is JsonWebKey {
  const k = v as JsonWebKey | null;
  return !!k && k.kty === 'EC' && k.crv === 'P-256' && typeof k.x === 'string' && typeof k.y === 'string' && !('d' in k);
}
