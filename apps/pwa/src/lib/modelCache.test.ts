import { describe, expect, it } from 'vitest';
import { loadModelBytes, type CacheLike } from './modelCache';

// Fake hash: the text of the bytes, so tests can name the "hash" of a body.
const hashOf = async (b: ArrayBuffer) => new TextDecoder().decode(b);

class FakeCache implements CacheLike {
  store = new Map<string, string>();
  async match(url: string) {
    const v = this.store.get(url);
    return v === undefined ? undefined : new Response(v);
  }
  async put(url: string, r: Response) {
    this.store.set(url, await r.text());
  }
  async delete(url: string) {
    return this.store.delete(url);
  }
}

const serve = (body: string, status = 200) => {
  const calls: string[] = [];
  const fn = async (u: string) => {
    calls.push(u);
    return new Response(body, { status });
  };
  return { fn, calls };
};

describe('loadModelBytes (E8-02 offline, H7)', () => {
  it('fetches, checks and caches the model on first load', async () => {
    const cache = new FakeCache();
    const net = serve('good');
    const r = await loadModelBytes('/m', 'good', hashOf, net.fn, cache);
    expect(r).toMatchObject({ ok: true, hash: 'good', fromCache: false });
    expect(cache.store.get('/m')).toBe('good');
  });

  it('uses the cached copy with no network call when it matches', async () => {
    const cache = new FakeCache();
    cache.store.set('/m', 'good');
    const offline = { fn: async () => Promise.reject(new TypeError('offline')), calls: [] };
    const r = await loadModelBytes('/m', 'good', hashOf, offline.fn, cache);
    expect(r).toMatchObject({ ok: true, fromCache: true });
  });

  it('drops a cached copy that does not match and fetches again', async () => {
    const cache = new FakeCache();
    cache.store.set('/m', 'old');
    const net = serve('good');
    const r = await loadModelBytes('/m', 'good', hashOf, net.fn, cache);
    expect(r).toMatchObject({ ok: true, fromCache: false });
    expect(net.calls).toEqual(['/m']);
    expect(cache.store.get('/m')).toBe('good');
  });

  it('never caches or uses bytes with the wrong hash', async () => {
    const cache = new FakeCache();
    const r = await loadModelBytes('/m', 'good', hashOf, serve('tampered').fn, cache);
    expect(r).toEqual({ ok: false, code: 'model_checksum' });
    expect(cache.store.size).toBe(0);
  });

  it('reports unreachable when offline with nothing cached, or on an HTTP error', async () => {
    const offline = async () => Promise.reject(new TypeError('offline'));
    expect(await loadModelBytes('/m', 'good', hashOf, offline, new FakeCache())).toEqual({ ok: false, code: 'model_unreachable' });
    expect(await loadModelBytes('/m', 'good', hashOf, serve('', 404).fn, new FakeCache())).toEqual({ ok: false, code: 'model_unreachable' });
  });

  it('still works when the cache is unavailable', async () => {
    const r = await loadModelBytes('/m', 'good', hashOf, serve('good').fn, null);
    expect(r).toMatchObject({ ok: true, fromCache: false });
  });
});
