import { describe, expect, it } from 'vitest';
import { BLANK_STD, COLOURFUL_MAX, DARK_MEAN, MIN_SIDE, checkQuality, colourfulness } from './quality';

function image(w: number, h: number, f: (i: number) => number) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = f(i);
  return a;
}
const textured = (i: number) => 60 + ((i * 37) % 140);

describe('checkQuality v1', () => {
  it('passes a large, textured, bright enough image', () => {
    const q = checkQuality(image(600, 600, textured), 600, 600);
    expect(q.passed).toBe(true);
    expect(q.reason).toBeNull();
  });

  it('fails an image whose shortest side is under the training floor', () => {
    const q = checkQuality(image(MIN_SIDE - 1, 800, textured), MIN_SIDE - 1, 800);
    expect(q).toMatchObject({ passed: false, reason: 'too_small' });
  });

  it('fails a blank image', () => {
    const q = checkQuality(image(600, 600, () => 128), 600, 600);
    expect(q).toMatchObject({ passed: false, reason: 'blank' });
    expect(q.std).toBeLessThan(BLANK_STD);
  });

  it('fails a very dark image', () => {
    const q = checkQuality(image(600, 600, (i) => (i * 13) % 50), 600, 600);
    expect(q).toMatchObject({ passed: false, reason: 'too_dark' });
    expect(q.mean).toBeLessThan(DARK_MEAN);
  });

  it('reports exactly one reason, size first', () => {
    const q = checkQuality(image(100, 100, () => 0), 100, 100);
    expect(q.reason).toBe('too_small');
  });

  it('fails a colourful photo as not an X-ray', () => {
    const q = checkQuality(image(600, 600, textured), 600, 600, COLOURFUL_MAX + 5);
    expect(q).toMatchObject({ passed: false, reason: 'not_xray' });
  });
});

describe('colourfulness', () => {
  const rgba = (f: (i: number) => [number, number, number]) => {
    const a = new Uint8Array(400 * 4);
    for (let i = 0; i < 400; i++) a.set([...f(i), 255], i * 4);
    return a;
  };
  it('is zero for grey pixels', () => {
    expect(colourfulness(rgba((i) => [i % 256, i % 256, i % 256]))).toBeCloseTo(0, 6);
  });
  it('stays low for a grey film on a blue light box', () => {
    expect(colourfulness(rgba((i) => [(i * 7) % 200, (i * 7) % 200, ((i * 7) % 200) + 30]))).toBeLessThan(COLOURFUL_MAX);
  });
  it('is high for a colourful photo', () => {
    expect(colourfulness(rgba((i) => (i % 3 === 0 ? [230, 40, 40] : i % 3 === 1 ? [40, 200, 60] : [50, 60, 220])))).toBeGreaterThan(COLOURFUL_MAX);
  });
});
