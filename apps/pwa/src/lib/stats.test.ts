import { describe, expect, it } from 'vitest';
import { histogram, inputStats, percentile, psi } from './stats';

describe('inputStats', () => {
  it('flat image: brightness is the value, edge energy is zero', () => {
    const s = inputStats(new Uint8Array(32 * 32).fill(100), 32, 1000, 800);
    expect(s.mean_brightness).toBe(100);
    expect(s.edge_energy).toBe(0);
    expect(s.aspect_ratio).toBe(1.25);
  });

  it('a checkerboard has more edge energy than a gradient', () => {
    const n = 32;
    const checker = new Uint8Array(n * n), grad = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      checker[y * n + x] = (x + y) % 2 ? 255 : 0;
      grad[y * n + x] = x * 8;
    }
    expect(inputStats(checker, n, 1, 1).edge_energy).toBeGreaterThan(inputStats(grad, n, 1, 1).edge_energy);
  });
});

describe('percentile', () => {
  it('nearest rank', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([], 95)).toBeNull();
  });
});

describe('histogram', () => {
  it('bins values in [0, 1] and clamps the ends', () => {
    expect(histogram([0, 0.05, 0.95, 1, 1.5, -1], 10)).toEqual([3, 0, 0, 0, 0, 0, 0, 0, 0, 3]);
  });
});

describe('psi', () => {
  it('is zero for identical distributions', () => {
    expect(psi([10, 20, 30], [1, 2, 3])).toBeCloseTo(0, 12);
  });

  it('grows when the distribution shifts', () => {
    const small = psi([30, 30, 40], [33, 33, 34])!;
    const big = psi([80, 10, 10], [33, 33, 34])!;
    expect(big).toBeGreaterThan(0.2);
    expect(small).toBeLessThan(big);
  });

  it('matches a hand-worked value', () => {
    // live 0.5/0.5, ref 0.25/0.75: (0.25)ln2 + (-0.25)ln(2/3)
    expect(psi([1, 1], [1, 3])).toBeCloseTo(0.25 * Math.log(2) - 0.25 * Math.log(2 / 3), 12);
  });

  it('returns null without data', () => {
    expect(psi([0, 0], [1, 1])).toBeNull();
  });
});
