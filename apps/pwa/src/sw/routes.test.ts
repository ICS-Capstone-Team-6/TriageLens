import { describe, expect, it } from 'vitest';
import { MODEL_CACHE, routeFor, staleCaches } from './routes';

const origin = 'https://app.example';
const get = (url: string, mode = 'cors') => routeFor({ url, method: 'GET', mode }, origin);

describe('routeFor (E8-02 offline)', () => {
  it('page navigations use the shell', () => {
    expect(get(`${origin}/`, 'navigate')).toBe('shell');
    expect(get(`${origin}/#/monitor`, 'navigate')).toBe('shell');
  });

  it('config files are network first so thresholds stay fresh online', () => {
    expect(get(`${origin}/config/thresholds.json`)).toBe('network-first');
  });

  it('own assets and ONNX Runtime files are cache first', () => {
    expect(get(`${origin}/assets/index-abc123.js`)).toBe('cache-first');
    expect(get(`${origin}/ort/ort-wasm-simd-threaded.wasm`)).toBe('cache-first');
  });

  it('never touches other origins, writes or the worker script', () => {
    expect(get('https://x.supabase.co/rest/v1/cases')).toBe('bypass');
    expect(get('https://models.example/tb.onnx')).toBe('bypass');
    expect(routeFor({ url: `${origin}/assets/a.js`, method: 'POST', mode: 'cors' }, origin)).toBe('bypass');
    expect(get(`${origin}/sw.js`)).toBe('bypass');
    expect(get('not a url')).toBe('bypass');
  });
});

describe('staleCaches', () => {
  it('deletes old shells only, never the model cache', () => {
    expect(staleCaches(['tl-shell-old', 'tl-shell-new', MODEL_CACHE, 'other'], 'tl-shell-new')).toEqual(['tl-shell-old']);
  });
});
