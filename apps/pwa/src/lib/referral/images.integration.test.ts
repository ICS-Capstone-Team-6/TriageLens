// End-to-end check of encrypted referral images against a LOCAL Supabase (never hosted).
// Skipped unless SUPABASE_E2E=1 with SUPABASE_URL and SUPABASE_ANON_KEY of `supabase start`.
// Fake users, fake facilities from seed.sql, a 1x1 fake JPEG. Run:
//   SUPABASE_E2E=1 SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... \
//   PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npx vitest run images.integration
import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createFacilityKey, decryptBlob, encryptBlob, newContentKey, unlockFacilityKey, unwrapContentKey, wrapContentKey,
  type WrappedContentKey, type WrappedPrivateKey,
} from './crypto';

const on = process.env.SUPABASE_E2E === '1' && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.SUPABASE_URL ?? '');
const psql = (q: string) => execSync(`psql -X -qtA "${process.env.PGURL}" -c "${q}"`).toString().trim();
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), (c) => c.charCodeAt(0));

async function user(tag: string, facility: string, role = 'health_worker'): Promise<SupabaseClient> {
  const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signUp({ email: `fake-${tag}-${Date.now()}@example.invalid`, password: 'fake-password-123' });
  if (error || !data.user) throw error ?? new Error('no user');
  psql(`update public.profiles set facility_id=(select id from public.facilities where name='${facility}'), role='${role}' where id='${data.user.id}'`);
  return c;
}

describe.skipIf(!on)('encrypted referral images, end to end (local Supabase)', () => {
  it('only the two facilities can decrypt; the server holds ciphertext', async () => {
    const tag = Date.now().toString(36);
    const facA = `FAKE e2e sender ${tag}`, facB = `FAKE e2e receiver ${tag}`, facC = `FAKE e2e other ${tag}`;
    psql(`insert into public.facilities(name) values ('${facA}'),('${facB}'),('${facC}')`);
    const id = (n: string) => psql(`select id from public.facilities where name='${n}'`);
    const [idA, idB] = [id(facA), id(facB)];
    const adminB = await user('adminb', facB, 'admin');
    const sender = await user('sender', facA);
    const recv = await user('recv', facB, 'reviewer');
    const other = await user('other', facC);

    // Receiving facility admin sets the key (fewer PBKDF2 rounds to keep the test quick).
    const PASS = 'fake receiving passphrase';
    const kB = await createFacilityKey(PASS, 100_000);
    expect((await adminB.rpc('set_facility_key', { p_public: kB.publicKey as never, p_wrapped: kB.wrapped as never })).error).toBeNull();

    const caseId = crypto.randomUUID(), rid = crypto.randomUUID();
    expect((await sender.rpc('save_case', { p_case: { id: caseId, age_band: '35-44', client_version: 1 } })).error).toBeNull();
    expect((await sender.rpc('create_referral', { p_referral: { id: rid, case_id: caseId, to_facility: idB, conditions: ['tb'], rules_version: 'v1' } })).error).toBeNull();
    expect((await sender.rpc('consent_image_share', { p_id: rid })).error).toBeNull();

    const pubs = (await sender.rpc('facility_public_keys', { p_ids: [idB, idA] })).data as Record<string, JsonWebKey>;
    expect(Object.keys(pubs)).toEqual([idB]); // the sender's facility has no key: wrap for the receiver only
    const ck = newContentKey();
    const sealed = await encryptBlob(JPEG.buffer, ck);
    const bucket = sender.storage.from('referral-images');
    expect((await bucket.upload(`${rid}/image.jpg`, JPEG, { contentType: 'image/jpeg' })).error).not.toBeNull(); // plain files refused
    expect((await bucket.upload(`${rid}/image.enc`, sealed, { contentType: 'application/octet-stream' })).error).toBeNull();
    const done = await sender.rpc('confirm_image_upload', { p_id: rid, p_keys: { [idB]: await wrapContentKey(ck, pubs[idB]) } as never });
    expect(done.error).toBeNull();

    // The stored bytes are not the image.
    const raw = await adminB.storage.from('referral-images').download(`${rid}/image.enc`);
    expect(raw.error).not.toBeNull(); // admins cannot read case images at all

    // Receiver: unlock with the passphrase, open, download, decrypt.
    const own = (await recv.rpc('own_facility_key')).data as { wrapped_private_key: WrappedPrivateKey };
    const priv = await unlockFacilityKey(own.wrapped_private_key, PASS);
    const opened = (await recv.rpc('open_referral_image', { p_id: rid })).data as { wrapped_key: WrappedContentKey };
    const dl = await recv.storage.from('referral-images').download(`${rid}/image.enc`);
    expect(dl.error).toBeNull();
    const bytes = new Uint8Array(await dl.data!.arrayBuffer());
    expect(bytes).not.toEqual(JPEG);
    const plain = new Uint8Array(await decryptBlob(bytes, await unwrapContentKey(opened.wrapped_key, priv)));
    expect(plain).toEqual(JPEG);
    await expect(unlockFacilityKey(own.wrapped_private_key, 'wrong passphrase here')).rejects.toThrow();

    // A third facility gets no key and no file.
    expect((await other.rpc('open_referral_image', { p_id: rid })).data).toBeNull();
    expect((await other.storage.from('referral-images').download(`${rid}/image.enc`)).error).not.toBeNull();
  }, 60_000);
});
