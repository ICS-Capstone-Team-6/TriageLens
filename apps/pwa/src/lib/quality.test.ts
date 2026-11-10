import { describe, expect, it } from 'vitest';
import en from '../strings/en.json';
import {
  BLANK_STD, BORDER_FLAT_MAX, BRIGHT_MEAN, COLOURFUL_MAX, DARK_MEAN, GLARE_FRACTION_MAX,
  MIN_SIDE, RETAKE_REASONS, SHARPNESS_MIN, checkQuality, colourfulness, glareFraction, sharpness,
} from './quality';

function image(w: number, h: number, f: (i: number) => number) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = f(i);
  return a;
}
const textured = (i: number) => 60 + ((i * 37) % 140);

/** Deterministic grain: high detail everywhere, no flat border, nothing clipped. */
function grain(w: number, h: number, seed = 12345) {
  const a = new Uint8Array(w * h);
  let s = seed;
  for (let i = 0; i < a.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    a[i] = 40 + (s % 180);
  }
  return a;
}

/** Large-scale structure (lung field, ribs) plus fine grain: an in-focus photo of a film. */
function film(w: number, h: number, seed = 12345) {
  const a = new Uint8Array(w * h);
  let s = seed;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
      const base = 110 + 55 * Math.sin(x / 37) * Math.cos(y / 53);
      a[y * w + x] = Math.max(0, Math.min(255, Math.round(base + (s % 40) - 20)));
    }
  }
  return a;
}

/** Separable box blur, cheap enough to run twice on a 512 px test image. */
function boxBlur(src: Uint8Array, w: number, h: number, r: number) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= w) continue;
        sum += src[y * w + xx]; n++;
      }
      tmp[y * w + x] = Math.round(sum / n);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= h) continue;
        sum += tmp[yy * w + x]; n++;
      }
      out[y * w + x] = Math.round(sum / n);
    }
  }
  return out;
}

describe('checkQuality: reasons already in v1', () => {
  it('passes a large, textured, bright enough image', () => {
    const q = checkQuality(image(600, 600, textured), 600, 600, 0);
    expect(q.passed).toBe(true);
    expect(q.reason).toBeNull();
    expect(q.version).toBe('quality-v2');
  });

  it('fails an image whose shortest side is under the training floor', () => {
    const q = checkQuality(image(MIN_SIDE - 1, 800, textured), MIN_SIDE - 1, 800, 0);
    expect(q).toMatchObject({ passed: false, reason: 'too_small' });
  });

  it('fails a blank image', () => {
    const q = checkQuality(image(600, 600, () => 128), 600, 600, 0);
    expect(q).toMatchObject({ passed: false, reason: 'blank' });
    expect(q.std).toBeLessThan(BLANK_STD);
  });

  it('fails a very dark image', () => {
    const q = checkQuality(image(600, 600, (i) => (i * 13) % 50), 600, 600, 0);
    expect(q).toMatchObject({ passed: false, reason: 'too_dark' });
    expect(q.mean).toBeLessThan(DARK_MEAN);
  });

  it('reports exactly one reason, size first', () => {
    const q = checkQuality(image(100, 100, () => 0), 100, 100, 0);
    expect(q.reason).toBe('too_small');
  });

  it('fails a colourful photo as not an X-ray', () => {
    const q = checkQuality(image(600, 600, textured), 600, 600, COLOURFUL_MAX + 5);
    expect(q).toMatchObject({ passed: false, reason: 'not_xray' });
  });
});

describe('checkQuality: exposure', () => {
  it('passes an ordinary bright film', () => {
    const q = checkQuality(grain(600, 600), 600, 600, 0);
    expect(q.passed).toBe(true);
    expect(q.mean).toBeLessThan(BRIGHT_MEAN);
  });

  it('fails a washed out image as too bright', () => {
    const q = checkQuality(image(600, 600, (i) => (i % 2 ? 255 : 225)), 600, 600, 0);
    expect(q).toMatchObject({ passed: false, reason: 'too_bright' });
    expect(q.mean).toBeGreaterThan(BRIGHT_MEAN);
  });
});

describe('checkQuality: glare', () => {
  it('counts a clipped highlight and fails the photo', () => {
    const a = grain(600, 600);
    for (let y = 240; y < 360; y++) for (let x = 240; x < 360; x++) a[y * 600 + x] = 255;
    const q = checkQuality(a, 600, 600, 0);
    expect(glareFraction(a, 600, 600)).toBeGreaterThan(GLARE_FRACTION_MAX);
    expect(q).toMatchObject({ passed: false, reason: 'glare' });
  });

  it('does not call an unclipped film glare', () => {
    expect(glareFraction(grain(600, 600), 600, 600)).toBe(0);
  });
});

describe('checkQuality: blur', () => {
  it('scores an in-focus film above the limit and an out-of-focus one below it', () => {
    const sharp = film(512, 512);
    const soft = boxBlur(sharp, 512, 512, 8);
    expect(sharpness(soft, 512, 512)).toBeLessThan(SHARPNESS_MIN);
    expect(sharpness(sharp, 512, 512)).toBeGreaterThan(SHARPNESS_MIN);
  });

  it('fails a blurred photo with a blur reason', () => {
    const q = checkQuality(boxBlur(film(512, 512), 512, 512, 8), 512, 512, 0);
    expect(q).toMatchObject({ passed: false, reason: 'blurred' });
    expect(q.std).toBeGreaterThan(BLANK_STD);
  });
});

describe('checkQuality: framing', () => {
  it('passes a film that fills the frame', () => {
    const q = checkQuality(grain(600, 600), 600, 600, 0);
    expect(q.border_flat).toBeLessThan(BORDER_FLAT_MAX);
    expect(q.reason).not.toBe('not_framed');
  });

  it('passes a protocol-compliant small border at phone resolution (TRD 7.4, Appendix C)', () => {
    const w = 1600, h = 1200, b = Math.round(h * 0.04);
    const a = image(w, h, (i) => {
      const x = i % w, y = Math.floor(i / w);
      const inside = x >= b && x < w - b && y >= b && y < h - b;
      return inside ? textured(i) : 20;
    });
    const q = checkQuality(a, w, h, 0);
    expect(q.border_flat).toBeLessThan(BORDER_FLAT_MAX);
    expect(q.reason).not.toBe('not_framed');
  });

  it('fails a film sitting small on a plain background', () => {
    const a = image(600, 600, (i) => {
      const x = i % 600, y = Math.floor(i / 600);
      return x > 120 && x < 480 && y > 120 && y < 480 ? textured(i) : 30;
    });
    const q = checkQuality(a, 600, 600, 0);
    expect(q.border_flat).toBeGreaterThanOrEqual(BORDER_FLAT_MAX);
    expect(q).toMatchObject({ passed: false, reason: 'not_framed' });
  });

  it('does not call a plainly dark photo badly framed', () => {
    const q = checkQuality(image(600, 600, () => 20), 600, 600, 0);
    expect(q.reason).toBe('blank');
  });
});

describe('checkQuality: contract', () => {
  it('shows a retake title and body for every reason it can return', () => {
    for (const reason of RETAKE_REASONS) {
      expect(en[`retake_title_${reason}` as keyof typeof en], `retake_title_${reason}`).toBeTruthy();
      expect(en[`retake_body_${reason}` as keyof typeof en], `retake_body_${reason}`).toBeTruthy();
    }
  });

  it('checks a 12 megapixel photo inside the 300 ms gate budget', () => {
    const big = grain(4000, 3000);
    const t0 = performance.now();
    const q = checkQuality(big, 4000, 3000, 0);
    const ms = performance.now() - t0;
    expect(q.width).toBe(4000);
    // Desktop proxy for NFR-PERF-03; the real budget check is on the reference phone (E5-01).
    expect(ms).toBeLessThan(300);
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
