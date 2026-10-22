import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INPUT_SIZE, normalize, resizeBilinear, rgbaToGray } from './preprocess';

// Fixture made by scripts/make_preprocess_fixture.py with Pillow (synthetic images only).
const dir = join(__dirname, '..', '..', 'test', 'fixtures');
const meta = JSON.parse(readFileSync(join(dir, 'preprocess_fixture.json'), 'utf8')) as {
  pillow: string; size: number; cases: { name: string; width: number; height: number; rgb: boolean }[];
};
const read = (f: string) => new Uint8Array(readFileSync(join(dir, f)));

describe('cxr-pre-2 matches Pillow exactly', () => {
  it('uses the model input size from the spec', () => {
    expect(meta.size).toBe(INPUT_SIZE);
  });

  for (const c of meta.cases) {
    if (c.rgb) it(`grayscale conversion: ${c.name} (${c.width} x ${c.height})`, () => {
      const gray = rgbaToGray(read(`pre_${c.name}_rgb.u8`), 3);
      expect(Buffer.compare(Buffer.from(gray), Buffer.from(read(`pre_${c.name}_gray.u8`)))).toBe(0);
    });

    it(`bilinear resize to 320: ${c.name}`, () => {
      const out = resizeBilinear(read(`pre_${c.name}_gray.u8`), c.width, c.height, INPUT_SIZE, INPUT_SIZE);
      const ref = read(`pre_${c.name}_out.u8`);
      let diff = 0;
      for (let i = 0; i < ref.length; i++) if (out[i] !== ref[i]) diff++;
      expect(diff).toBe(0);
    });
  }

  it('normalizes into three identical channels with ImageNet mean and std', () => {
    const x = normalize(new Uint8Array([0, 255]));
    expect(x.length).toBe(6);
    expect(x[0]).toBeCloseTo((0 - 0.485) / 0.229, 6);
    expect(x[1]).toBeCloseTo((1 - 0.485) / 0.229, 6);
    expect(x[3]).toBeCloseTo((1 - 0.456) / 0.224, 6);
    expect(x[5]).toBeCloseTo((1 - 0.406) / 0.225, 6);
  });

  it('a plain canvas-style resize would not match (guards against swapping the resampler)', () => {
    const c = meta.cases[0];
    const gray = read(`pre_${c.name}_gray.u8`);
    // nearest-neighbour stand-in for a naive resize
    const naive = new Uint8Array(INPUT_SIZE * INPUT_SIZE);
    for (let y = 0; y < INPUT_SIZE; y++)
      for (let x = 0; x < INPUT_SIZE; x++)
        naive[y * INPUT_SIZE + x] = gray[Math.floor((y * c.height) / INPUT_SIZE) * c.width + Math.floor((x * c.width) / INPUT_SIZE)];
    const ref = read(`pre_${c.name}_out.u8`);
    let diff = 0;
    for (let i = 0; i < ref.length; i++) if (naive[i] !== ref[i]) diff++;
    expect(diff).toBeGreaterThan(ref.length / 2);
  });
});
