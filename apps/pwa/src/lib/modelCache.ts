// Model bytes for the inference worker (E8-02 offline, hazard H7). The worker keeps the model
// in the Cache API so screening works with no network after the first load. Only bytes whose
// SHA-256 matches the expected hash are stored or used: a cached copy that no longer matches
// (a new model, or a damaged cache) is deleted and fetched again.
export type ModelLoad = { ok: true; bytes: ArrayBuffer; hash: string; fromCache: boolean } | { ok: false; code: 'model_unreachable' | 'model_checksum' };

export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, r: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export async function loadModelBytes(
  url: string,
  expectedSha256: string,
  sha256Hex: (b: ArrayBuffer) => Promise<string>,
  fetchFn: (url: string) => Promise<Response>,
  cache: CacheLike | null,
): Promise<ModelLoad> {
  const want = expectedSha256.toLowerCase();
  if (cache && want) {
    try {
      const hit = await cache.match(url);
      if (hit) {
        const bytes = await hit.arrayBuffer();
        const hash = await sha256Hex(bytes);
        if (hash === want) return { ok: true, bytes, hash, fromCache: true };
        await cache.delete(url);
      }
    } catch {
      // A broken cache must not block screening: fall through to the network.
    }
  }
  let r: Response;
  try {
    r = await fetchFn(url);
  } catch {
    return { ok: false, code: 'model_unreachable' };
  }
  if (!r.ok) return { ok: false, code: 'model_unreachable' };
  const bytes = await r.arrayBuffer();
  const hash = await sha256Hex(bytes);
  if (want && hash !== want) return { ok: false, code: 'model_checksum' };
  if (cache && want) {
    try {
      await cache.put(url, new Response(bytes.slice(0)));
    } catch {
      // Storage full or blocked: screening still works online; offline needs a later retry.
    }
  }
  return { ok: true, bytes, hash, fromCache: false };
}
