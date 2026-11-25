// Facility key handling on the phone (E10-07, ADR-28 section 4). See crypto.ts for the scheme.
// The unlocked private key is a non-extractable CryptoKey: kept in memory and in this
// browser's IndexedDB so staff type the passphrase once per phone. It cannot be read out
// of the browser, only used. Signing out clears it.
import { supabase } from '../supabase';
import { createFacilityKey, isPublicJwk, isWrappedPrivateKey, unlockFacilityKey } from './crypto';

const DB = 'triagelens-keys';
const STORE = 'facility';
let memory: { facilityId: string; key: CryptoKey } | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = op(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function unlockedKey(facilityId: string): Promise<CryptoKey | null> {
  if (memory?.facilityId === facilityId) return memory.key;
  const stored = await idb<CryptoKey>('readonly', (s) => s.get(facilityId));
  if (stored) memory = { facilityId, key: stored };
  return stored;
}

export async function forgetKeys(): Promise<void> {
  memory = null;
  await idb('readwrite', (s) => s.clear());
}

export interface OwnKey {
  facilityId: string;
  hasKey: boolean;
  publicKey: JsonWebKey | null;
  wrapped: unknown;
}

export async function ownFacilityKey(): Promise<OwnKey | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('own_facility_key');
  if (error || !data) return null;
  const d = data as { facility_id: string; has_key: boolean; public_key?: unknown; wrapped_private_key?: unknown };
  return { facilityId: d.facility_id, hasKey: d.has_key, publicKey: isPublicJwk(d.public_key) ? d.public_key : null, wrapped: d.wrapped_private_key };
}

/** Unlocks this facility's key with the passphrase; false on a wrong passphrase. */
export async function unlock(passphrase: string): Promise<boolean> {
  const own = await ownFacilityKey();
  if (!own?.hasKey || !isWrappedPrivateKey(own.wrapped)) return false;
  try {
    const key = await unlockFacilityKey(own.wrapped, passphrase);
    memory = { facilityId: own.facilityId, key };
    await idb('readwrite', (s) => s.put(key, own.facilityId));
    return true;
  } catch {
    return false;
  }
}

/** Facility admin only (the database checks). Creates the key, then unlocks it here. */
export async function setUpFacilityKey(passphrase: string): Promise<boolean> {
  if (!supabase) return false;
  const { publicKey, wrapped } = await createFacilityKey(passphrase);
  const { error } = await supabase.rpc('set_facility_key', { p_public: publicKey as never, p_wrapped: wrapped as never });
  if (error) return false;
  return unlock(passphrase);
}

export async function publicKeys(ids: string[]): Promise<Record<string, JsonWebKey>> {
  if (!supabase || ids.length === 0) return {};
  const { data, error } = await supabase.rpc('facility_public_keys', { p_ids: ids });
  if (error || !data || typeof data !== 'object') return {};
  return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, v]) => isPublicJwk(v))) as Record<string, JsonWebKey>;
}

export async function isFacilityAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from('profiles').select('role').single();
  return data?.role === 'admin';
}
