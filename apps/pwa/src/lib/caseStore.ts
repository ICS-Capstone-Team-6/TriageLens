// Local case log (E8-06, FR-07, ADR-7). Cases live in IndexedDB on the phone. A case is
// written at capture, before the model runs, so a crash cannot lose it (H9, NFR-REL-01).
// Its UUID is reused for the server record, so a later sync (E9-02) is a safe upsert.
// No names or phone numbers: a random code like TL-7K3MPQ is the only case label (NFR-PRIV-01).
// Images are stored only encrypted (imageCrypto.ts); without a key there is no image at all.
import type { AgeBand } from './records';
import type { Zone } from './triage';

export const DB_NAME = 'triagelens';
const DB_VERSION = 1;
const CASES = 'cases';
const IMAGES = 'images';
export const NOTES_MAX = 2000;
export const PAGE_SIZE = 30;

export type CaseStatus = 'captured' | 'result' | 'retake' | 'error';

export interface CaseResult {
  zone: Zone;
  modelVersion: string;
  thresholdsVersion: string;
  preprocessVersion: string;
  quality: { passed: boolean; reason: string | null };
}

export interface LocalCase {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
  ageBand: AgeBand;
  status: CaseStatus;
  result: CaseResult | null;
  notes: string;
  version: number;
  synced: boolean;
}

export interface StoredImage {
  caseId: string;
  iv: Uint8Array;
  data: ArrayBuffer;
  type: string;
}

// No 0/O or 1/I/L: the code is read aloud and copied by hand.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function makeCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(6);
  return `TL-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

/** Search text to a code prefix: case and spaces do not matter, "tl-" is optional. */
export function normaliseQuery(q: string): string {
  const s = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.startsWith('TL') ? `TL-${s.slice(2)}` : `TL-${s}`;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openCaseDb(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      const cases = db.createObjectStore(CASES, { keyPath: 'id' });
      cases.createIndex('createdAt', 'createdAt');
      cases.createIndex('code', 'code', { unique: true });
      db.createObjectStore(IMAGES, { keyPath: 'caseId' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Write the case at capture, before inference. */
export async function createCase(db: IDBDatabase, ageBand: AgeBand, now = new Date()): Promise<LocalCase> {
  const at = now.toISOString();
  const c: LocalCase = {
    id: crypto.randomUUID(), code: makeCode(), createdAt: at, updatedAt: at, ageBand,
    status: 'captured', result: null, notes: '', version: 1, synced: false,
  };
  const tx = db.transaction(CASES, 'readwrite');
  tx.objectStore(CASES).add(c);
  await done(tx);
  return c;
}

export async function getCase(db: IDBDatabase, id: string): Promise<LocalCase | undefined> {
  return req(db.transaction(CASES).objectStore(CASES).get(id));
}

async function update(db: IDBDatabase, id: string, change: (c: LocalCase) => Partial<LocalCase>): Promise<LocalCase> {
  const tx = db.transaction(CASES, 'readwrite');
  const store = tx.objectStore(CASES);
  const c = (await req(store.get(id))) as LocalCase | undefined;
  if (!c) throw new Error('case not found');
  const next: LocalCase = { ...c, ...change(c), version: c.version + 1, updatedAt: new Date().toISOString(), synced: false };
  store.put(next);
  await done(tx);
  return next;
}

/** Record how the screening ended. A result is never changed once written (inferences are immutable).
 *  A retake keeps its quality reason and versions with zone 'retake', so it never shows a zone (TRD 7.2). */
export function finishCase(db: IDBDatabase, id: string, status: Exclude<CaseStatus, 'captured'>, result: CaseResult | null) {
  return update(db, id, (c) => {
    if (c.status !== 'captured') throw new Error('case already finished');
    if (status === 'error' || !result) return { status, result: null };
    return { status, result: status === 'retake' ? { ...result, zone: 'retake' } : result };
  });
}

export function setNotes(db: IDBDatabase, id: string, notes: string) {
  return update(db, id, () => ({ notes: notes.slice(0, NOTES_MAX) }));
}

/** Newest first, one page at a time; pass the last case's createdAt to get the next page. */
export async function listCases(db: IDBDatabase, before?: string, limit = PAGE_SIZE): Promise<LocalCase[]> {
  const index = db.transaction(CASES).objectStore(CASES).index('createdAt');
  const range = before ? IDBKeyRange.upperBound(before, true) : undefined;
  const out: LocalCase[] = [];
  return new Promise((resolve, reject) => {
    const r = index.openCursor(range, 'prev');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const cur = r.result;
      if (!cur || out.length >= limit) return resolve(out);
      out.push(cur.value as LocalCase);
      cur.continue();
    };
  });
}

/** Cases whose code starts with the query, newest first. */
export async function findByCode(db: IDBDatabase, query: string, limit = PAGE_SIZE): Promise<LocalCase[]> {
  const prefix = normaliseQuery(query);
  const index = db.transaction(CASES).objectStore(CASES).index('code');
  const found = (await req(index.getAll(IDBKeyRange.bound(prefix, `${prefix}￿`), limit))) as LocalCase[];
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countCases(db: IDBDatabase): Promise<number> {
  return req(db.transaction(CASES).objectStore(CASES).count());
}

/** Store an already-encrypted image. Callers must encrypt first (imageCrypto.encryptImage). */
export async function putImage(db: IDBDatabase, image: StoredImage): Promise<void> {
  const tx = db.transaction(IMAGES, 'readwrite');
  tx.objectStore(IMAGES).put(image);
  await done(tx);
}

export async function getImage(db: IDBDatabase, caseId: string): Promise<StoredImage | undefined> {
  return req(db.transaction(IMAGES).objectStore(IMAGES).get(caseId));
}
