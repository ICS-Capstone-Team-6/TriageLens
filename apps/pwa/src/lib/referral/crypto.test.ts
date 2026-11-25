import { describe, expect, it } from 'vitest';
import {
  createFacilityKey, decryptBlob, encryptBlob, isPublicJwk, isWrappedContentKey, isWrappedPrivateKey,
  newContentKey, passphraseProblem, unlockFacilityKey, unwrapContentKey, wrapContentKey,
} from './crypto';

// Fewer PBKDF2 rounds keep the tests fast; the app uses 600 000.
const ROUNDS = 100_000;
const PASS = 'fake facility passphrase';

describe('facility key', () => {
  it('unlocks with the right passphrase only', async () => {
    const { publicKey, wrapped } = await createFacilityKey(PASS, ROUNDS);
    expect(isPublicJwk(publicKey)).toBe(true);
    expect(isWrappedPrivateKey(wrapped)).toBe(true);
    expect(JSON.stringify(wrapped)).not.toContain(PASS);
    await expect(unlockFacilityKey(wrapped, PASS)).resolves.toBeDefined();
    await expect(unlockFacilityKey(wrapped, 'wrong passphrase!!')).rejects.toThrow();
  });

  it('the unlocked private key cannot be exported', async () => {
    const { wrapped } = await createFacilityKey(PASS, ROUNDS);
    const k = await unlockFacilityKey(wrapped, PASS);
    expect(k.extractable).toBe(false);
  });

  it('rejects a public key that carries a private part', () => {
    expect(isPublicJwk({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'secret' })).toBe(false);
  });

  it('asks for a passphrase of at least 12 characters', () => {
    expect(passphraseProblem('short')).toBe('too_short');
    expect(passphraseProblem('long enough phrase')).toBeNull();
  });
});

describe('content key and blobs', () => {
  it('round-trips through two facilities, and a third facility cannot unwrap', async () => {
    const recv = await createFacilityKey(PASS, ROUNDS);
    const send = await createFacilityKey('another fake passphrase', ROUNDS);
    const other = await createFacilityKey('third fake passphrase', ROUNDS);
    const ck = newContentKey();
    const forRecv = await wrapContentKey(ck, recv.publicKey);
    const forSend = await wrapContentKey(ck, send.publicKey);
    expect(isWrappedContentKey(forRecv)).toBe(true);

    const data = new TextEncoder().encode('FAKE image bytes').buffer;
    const sealed = await encryptBlob(data, ck);
    expect(new TextDecoder().decode(sealed)).not.toContain('FAKE image bytes');

    const recvKey = await unwrapContentKey(forRecv, await unlockFacilityKey(recv.wrapped, PASS));
    const sendKey = await unwrapContentKey(forSend, await unlockFacilityKey(send.wrapped, 'another fake passphrase'));
    expect(new TextDecoder().decode(await decryptBlob(sealed, recvKey))).toBe('FAKE image bytes');
    expect(new TextDecoder().decode(await decryptBlob(sealed, sendKey))).toBe('FAKE image bytes');

    const otherPriv = await unlockFacilityKey(other.wrapped, 'third fake passphrase');
    await expect(unwrapContentKey(forRecv, otherPriv)).rejects.toThrow();
  });

  it('detects a changed file', async () => {
    const ck = newContentKey();
    const sealed = await encryptBlob(new Uint8Array([1, 2, 3, 4]).buffer, ck);
    sealed[sealed.length - 1] ^= 1;
    await expect(decryptBlob(sealed, ck)).rejects.toThrow();
    await expect(decryptBlob(new Uint8Array(5), ck)).rejects.toThrow();
  });

  it('each encryption uses a new IV', async () => {
    const ck = newContentKey();
    const a = await encryptBlob(new Uint8Array([9]).buffer, ck);
    const b = await encryptBlob(new Uint8Array([9]).buffer, ck);
    expect(a.slice(0, 12)).not.toEqual(b.slice(0, 12));
  });
});
