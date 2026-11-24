import { describe, expect, it } from 'vitest';
import { decryptImage, deriveImageKey, encryptImage, newSalt, PBKDF2_ITERATIONS } from './imageCrypto';

describe('image encryption at rest (NFR-SEC-02)', () => {
  it('uses at least 600,000 PBKDF2 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it('round-trips, uses a fresh IV each time, and refuses a wrong PIN or changed data', async () => {
    const salt = newSalt();
    const key = await deriveImageKey('482913', salt);
    const bytes = new TextEncoder().encode('fake image bytes').buffer;
    const a = await encryptImage(key, bytes);
    const b = await encryptImage(key, bytes);
    expect(a.iv).toHaveLength(12);
    expect([...a.iv]).not.toEqual([...b.iv]);
    expect(new TextDecoder().decode(await decryptImage(key, a.iv, a.data))).toBe('fake image bytes');

    const wrong = await deriveImageKey('000000', salt);
    await expect(decryptImage(wrong, a.iv, a.data)).rejects.toThrow();
    const changed = new Uint8Array(a.data.slice(0));
    changed[0] ^= 1;
    await expect(decryptImage(key, a.iv, changed.buffer)).rejects.toThrow();
  }, 20_000);
});
