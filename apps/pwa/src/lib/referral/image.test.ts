import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_SIDE, QUALITIES } from './image';

describe('fitWithin', () => {
  it('scales the longer side down to the limit and keeps the shape', () => {
    expect(fitWithin(3200, 4000)).toEqual({ w: 1280, h: 1600 });
    expect(fitWithin(4000, 3000)).toEqual({ w: 1600, h: 1200 });
  });
  it('never scales up', () => {
    expect(fitWithin(800, 600)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(MAX_SIDE, MAX_SIDE)).toEqual({ w: MAX_SIDE, h: MAX_SIDE });
  });
  it('bad sizes give zero', () => {
    expect(fitWithin(0, 10)).toEqual({ w: 0, h: 0 });
    expect(fitWithin(Number.NaN, 10)).toEqual({ w: 0, h: 0 });
  });
  it('a very thin image keeps at least one pixel', () => {
    expect(fitWithin(10000, 2).h).toBeGreaterThanOrEqual(1);
  });
});

describe('QUALITIES', () => {
  it('tries the highest quality first and stays readable', () => {
    expect([...QUALITIES]).toEqual([...QUALITIES].sort((a, b) => b - a));
    expect(Math.min(...QUALITIES)).toBeGreaterThanOrEqual(0.5);
  });
});
