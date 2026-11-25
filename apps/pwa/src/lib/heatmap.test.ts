import { describe, expect, it } from 'vitest';
import { computeCam, heatColour, normalizeCam, parseCamHead, type CamHead } from './heatmap';

const SHA = 'ab'.repeat(32);
const file = { version: 'cam-head-1', run_id: 'run-x', model_sha256: SHA.toUpperCase(), channels: 2, weight: [1, -2], bias: 0.5 };

describe('parseCamHead (bound to the model, H7)', () => {
  it('accepts the file for this exact model', () => {
    expect(parseCamHead(file, 'run-x', SHA)?.channels).toBe(2);
  });
  it.each([
    ['another run', { ...file, run_id: 'run-y' }],
    ['another model file', { ...file, model_sha256: 'cd'.repeat(32) }],
    ['wrong weight count', { ...file, weight: [1] }],
    ['a NaN weight', { ...file, weight: [1, Number.NaN] }],
    ['pending placeholder', { version: 'cam-head-1', status: 'pending' }],
  ])('rejects %s', (_l, f) => expect(parseCamHead(f, 'run-x', SHA)).toBeNull());
});

describe('computeCam', () => {
  const head: CamHead = { version: 'cam-head-1', runId: 'r', modelSha256: SHA, channels: 2, weight: Float32Array.from([1, -2]), bias: 0 };
  it('is the weighted sum over channels, like TBNet.cam', () => {
    // C=2, h=1, w=3
    const f = Float32Array.from([1, 2, 3, 0.5, 0.5, 0.5]);
    expect([...(computeCam(f, [2, 1, 3], head) as Float32Array)]).toEqual([0, 1, 2]);
  });
  it('refuses shapes that do not match the head', () => {
    expect(computeCam(new Float32Array(6), [3, 1, 2], head)).toBeNull();
    expect(computeCam(new Float32Array(5), [2, 1, 3], head)).toBeNull();
  });
});

describe('normalizeCam and heatColour', () => {
  it('keeps positive evidence only, scaled to 0..1', () => {
    expect([...(normalizeCam(Float32Array.from([-4, 0, 2, 4])) as Float32Array)]).toEqual([0, 0, 0.5, 1]);
  });
  it('null when nothing raised the score', () => {
    expect(normalizeCam(Float32Array.from([-1, 0, Number.NaN]))).toBeNull();
  });
  it('low values stay clear; the strongest is red and most opaque', () => {
    expect(heatColour(0.1)[3]).toBe(0);
    expect(heatColour(1)).toEqual([255, 0, 0, 190]);
    expect(heatColour(0.6)[3]).toBeLessThan(heatColour(1)[3]);
  });
});
