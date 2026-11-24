import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  countCases, createCase, findByCode, finishCase, getCase, getImage, listCases, makeCode, normaliseQuery,
  NOTES_MAX, openCaseDb, putImage, setNotes, type CaseResult,
} from './caseStore';

const fresh = () => openCaseDb(new IDBFactory());
const result: CaseResult = {
  zone: 'unsure', modelVersion: 'm1', thresholdsVersion: 't1', preprocessVersion: 'cxr-pre-2',
  quality: { passed: true, reason: null },
};

describe('case codes', () => {
  it('look like TL-XXXXXX with no 0, O, 1, I or L', () => {
    for (let i = 0; i < 200; i++) expect(makeCode()).toMatch(/^TL-[2-9A-HJKMNP-Z]{6}$/);
  });

  it('search text is normalised: case, spaces and the TL prefix do not matter', () => {
    expect(normaliseQuery('tl-7k3')).toBe('TL-7K3');
    expect(normaliseQuery(' 7k 3 ')).toBe('TL-7K3');
    expect(normaliseQuery('TL7K3')).toBe('TL-7K3');
  });
});

describe('local case log (E8-06, FR-07)', () => {
  it('writes the case at capture, before any result, with no patient identifiers', async () => {
    const db = await fresh();
    const c = await createCase(db, '25-34');
    expect(c.status).toBe('captured');
    expect(c.result).toBeNull();
    expect(Object.keys(c).sort()).toEqual(
      ['ageBand', 'code', 'createdAt', 'id', 'notes', 'result', 'status', 'synced', 'updatedAt', 'version'],
    );
    expect(await getCase(db, c.id)).toEqual(c);
  });

  it('survives closing and reopening the database (an app restart)', async () => {
    const factory = new IDBFactory();
    const db1 = await openCaseDb(factory);
    const c = await createCase(db1, '45-54');
    db1.close();
    const db2 = await openCaseDb(factory);
    expect((await getCase(db2, c.id))?.code).toBe(c.code);
  });

  it('records the result with every version, bumps the version and marks it unsynced', async () => {
    const db = await fresh();
    const c = await createCase(db, '15-24');
    const r = await finishCase(db, c.id, 'result', result);
    expect(r).toMatchObject({ status: 'result', version: 2, synced: false, result });
  });

  it('never rewrites a finished result', async () => {
    const db = await fresh();
    const c = await createCase(db, '15-24');
    await finishCase(db, c.id, 'result', result);
    await expect(finishCase(db, c.id, 'result', { ...result, zone: 'low_risk' })).rejects.toThrow();
    expect((await getCase(db, c.id))?.result?.zone).toBe('unsure');
  });

  it('a retake keeps its quality reason and versions but never a zone', async () => {
    const db = await fresh();
    const c = await createCase(db, '15-24');
    const failed = { ...result, quality: { passed: false, reason: 'too_dark' } };
    const r = await finishCase(db, c.id, 'retake', failed);
    expect(r.status).toBe('retake');
    expect(r.result).toMatchObject({ zone: 'retake', quality: { passed: false, reason: 'too_dark' }, modelVersion: 'm1' });
  });

  it('an error stores no result', async () => {
    const db = await fresh();
    const c = await createCase(db, '15-24');
    expect((await finishCase(db, c.id, 'error', result)).result).toBeNull();
  });

  it('notes are saved and capped', async () => {
    const db = await fresh();
    const c = await createCase(db, '65+');
    const r = await setNotes(db, c.id, 'x'.repeat(NOTES_MAX + 50));
    expect(r.notes.length).toBe(NOTES_MAX);
  });

  it('lists newest first in pages, and finds a case by code prefix', async () => {
    const db = await fresh();
    const made = [];
    for (let i = 0; i < 5; i++) made.push(await createCase(db, '35-44', new Date(Date.UTC(2026, 10, 24, 8, i))));
    const page1 = await listCases(db, undefined, 3);
    expect(page1.map((c) => c.id)).toEqual(made.slice(2).reverse().map((c) => c.id));
    const page2 = await listCases(db, page1[2].createdAt, 3);
    expect(page2.map((c) => c.id)).toEqual(made.slice(0, 2).reverse().map((c) => c.id));
    const target = made[3];
    expect((await findByCode(db, target.code.slice(3).toLowerCase())).map((c) => c.id)).toContain(target.id);
  });

  it('holds 500 cases and still opens the first page quickly (NFR-OFFL-02)', async () => {
    const db = await fresh();
    for (let i = 0; i < 500; i++) await createCase(db, '25-34', new Date(Date.UTC(2026, 0, 1) + i * 60_000));
    expect(await countCases(db)).toBe(500);
    const t0 = performance.now();
    const page = await listCases(db);
    const ms = performance.now() - t0;
    expect(page).toHaveLength(30);
    expect(ms).toBeLessThan(200);
  });

  it('stores an image record only as given (callers encrypt first)', async () => {
    const db = await fresh();
    const c = await createCase(db, '25-34');
    const iv = new Uint8Array(12).fill(7);
    await putImage(db, { caseId: c.id, iv, data: new Uint8Array([1, 2, 3]).buffer, type: 'image/webp' });
    expect((await getImage(db, c.id))?.type).toBe('image/webp');
  });
});
