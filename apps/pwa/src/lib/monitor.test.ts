import { describe, expect, it } from 'vitest';
import { binByEdges, summarize, toCsv, type Reference } from './monitor';
import type { InferenceRow } from './records';

function row(p: Partial<InferenceRow> & { prob?: number | null; ar?: number }): InferenceRow {
  return {
    id: crypto.randomUUID(),
    created_at: p.created_at ?? '2026-10-22T10:00:00Z',
    model_version: 'm1',
    thresholds_version: 'v0-uncalibrated',
    zone: p.zone ?? 'unsure',
    latency_ms: p.latency_ms ?? 1000,
    outputs: { tb_probability: p.prob ?? 0.5, input_stats: { aspect_ratio: p.ar ?? 1, edge_energy: 0.05, mean_brightness: 120, width: 1000 } },
    quality_scores: { passed: p.zone !== 'retake', reason: p.zone === 'retake' ? 'too_dark' : null },
    device_info: p.device_info ?? { preprocess: 'cxr-pre-2', app_build: 'abc', timings: { model_ms: p.latency_ms ?? 1000 } },
  };
}

describe('summarize', () => {
  it('counts quality failures, zones, mismatches and the latest record', () => {
    const rows = [
      row({ zone: 'refer_now', prob: 0.9, created_at: '2026-10-22T10:00:00Z' }),
      row({ zone: 'retake', prob: null, created_at: '2026-10-22T11:00:00Z' }),
      row({ zone: 'low_risk', prob: 0.05, device_info: { preprocess: 'cxr-pre-1', app_build: 'abc' } }),
    ];
    const s = summarize(rows, null);
    expect(s.total).toBe(3);
    expect(s.qualityFailed).toBe(1);
    expect(s.zones).toEqual({ refer_now: 1, unsure: 0, low_risk: 1, retake: 1 });
    expect(s.mismatches).toBe(1);
    expect(s.last).toBe('2026-10-22T11:00:00Z');
    expect(s.scoreHist.reduce((a, b) => a + b, 0)).toBe(2);
    expect(s.versions.preprocess).toEqual(['cxr-pre-1', 'cxr-pre-2']);
  });

  it('p95 latency uses scored results only', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ latency_ms: (i + 1) * 100 }));
    rows.push(row({ zone: 'retake', latency_ms: 99999 }));
    expect(summarize(rows, null).latencyP95).toBe(1900);
  });

  it('model p95 excludes decode and preprocessing time and ignores missing timers', () => {
    const rows = [
      row({ latency_ms: 9000, device_info: { preprocess: 'cxr-pre-2', timings: { model_ms: 300 } } }),
      row({ latency_ms: 12000, device_info: { preprocess: 'cxr-pre-2', timings: { model_ms: 500 } } }),
      row({ latency_ms: 99000, device_info: { preprocess: 'cxr-pre-2' } }),
    ];
    expect(summarize(rows, null).latencyP95).toBe(500);
    expect(summarize([rows[2]], null).latencyP95).toBeNull();
    const lines = toCsv([rows[0]]).trim().split('\n');
    const values = Object.fromEntries(lines[0].split(',').map((key, i) => [key, lines[1].split(',')[i]]));
    expect(values.latency_ms).toBe('9000');
    expect(values.model_ms).toBe('300');
  });

  it('no reference: no PSI and no reference histogram, but medians', () => {
    const s = summarize([row({ ar: 0.8 }), row({ ar: 1.2 })], { status: 'pending', score_hist_validation: null, inputs: null });
    expect(s.refHist).toBeNull();
    expect(s.drift.every((d) => d.psi === null)).toBe(true);
    expect(s.drift.find((d) => d.stat === 'aspect_ratio')?.median).toBe(0.8);
  });

  it('with a reference: PSI is computed on the reference bins', () => {
    const ref: Reference = {
      status: 'set',
      score_hist_validation: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      inputs: { aspect_ratio: { edges: [0, 0.9, 1.1, 3], counts: [10, 80, 10] } },
    };
    const same = Array.from({ length: 100 }, (_, i) => row({ ar: i < 10 ? 0.5 : i < 90 ? 1 : 2 }));
    const shifted = Array.from({ length: 100 }, () => row({ ar: 0.5 }));
    const psiSame = summarize(same, ref).drift.find((d) => d.stat === 'aspect_ratio')!.psi!;
    const psiShift = summarize(shifted, ref).drift.find((d) => d.stat === 'aspect_ratio')!.psi!;
    expect(psiSame).toBeCloseTo(0, 6);
    expect(psiShift).toBeGreaterThan(0.2);
  });
});

describe('binByEdges', () => {
  it('bins by edges and clamps outside values', () => {
    expect(binByEdges([-1, 0, 0.5, 1, 2, 9], [0, 1, 2, 3])).toEqual([3, 1, 2]);
  });
});

describe('toCsv', () => {
  it('writes a header and one line per record, numbers only', () => {
    const csv = toCsv([row({ zone: 'refer_now', prob: 0.9 })]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith('created_at,zone')).toBe(true);
    expect(lines[1]).toContain('refer_now');
  });
});
