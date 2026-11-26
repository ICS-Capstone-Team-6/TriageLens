// Automatic design checks on sky.css and the screens (H8, NFR-USAB-02, TRD 7.3).
// * Contrast: the colour pairs the app depends on, from the CSS tokens, plus every rule that
//   sets both a text colour and a solid background. Text 4.5:1, icons and UI parts 3:1 (WCAG 1.4.3, 1.4.11).
// * Touch targets: every class used on a button, link or summary is at least 48px tall, no
//   rule or inline style makes one smaller, and the zone icon colours match the tokens.
// Disabled controls are exempt from contrast (WCAG 1.4.3) and are skipped.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const css = readFileSync(join(SRC, 'ui/sky.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const MIN_TARGET = 48;

// ---- tokens and rules ----
const root = /:root\s*\{([^}]*)\}/.exec(css)![1];
const tokens = Object.fromEntries([...root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const resolve = (v: string): string => v.replace(/var\(--([\w-]+)\)/g, (_, k: string) => resolve(tokens[k] ?? `<missing ${k}>`)).trim();

interface Rule { selector: string; decl: Record<string, string> }
// Innermost blocks only, so rules inside @media are read with their own selectors.
const rules: Rule[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim(),
  decl: Object.fromEntries(m[2].split(';').map((d) => d.split(/:(.*)/s)).filter((p) => p.length > 1).map(([k, v]) => [k.trim(), v.trim()])),
}));

// ---- WCAG contrast ----
function hex(c: string): [number, number, number] | null {
  const v = resolve(c).toLowerCase();
  if (v === '#fff' || v === 'white') return [255, 255, 255];
  const m = /^#([0-9a-f]{6})$/.exec(v);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number] : null;
}
const lum = ([r, g, b]: [number, number, number]) => {
  const ch = (x: number) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export function contrast(a: string, b: string): number {
  const x = hex(a), y = hex(b);
  if (!x || !y) throw new Error(`not a solid colour: ${a} / ${b}`);
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

describe('contrast: named pairs (H8)', () => {
  const text: [string, string, string][] = [
    ['body text on paper', 'var(--obsidian)', 'var(--paper)'],
    ['ink on paper', 'var(--ink)', 'var(--paper)'],
    ['secondary text on paper', 'var(--charcoal)', 'var(--paper)'],
    ['secondary text on cloud cards', 'var(--charcoal)', 'var(--cloud)'],
    ['tertiary text on paper', 'var(--slate)', 'var(--paper)'],
    ['tertiary text on cloud', 'var(--slate)', 'var(--cloud)'],
    ['refer now words on their colour', 'var(--zone-refer-ink)', 'var(--zone-refer)'],
    ['not sure words on their colour', 'var(--zone-unsure-ink)', 'var(--zone-unsure)'],
    ['low risk words on their colour', 'var(--zone-low-ink)', 'var(--zone-low)'],
    ['refer now words in a case list', 'var(--zone-refer-ink)', 'var(--paper)'],
    ['not sure words in a case list', 'var(--zone-unsure-ink)', 'var(--paper)'],
    ['low risk words in a case list', 'var(--zone-low-ink)', 'var(--paper)'],
    ['white on obsidian (camera, primary buttons)', '#ffffff', 'var(--obsidian)'],
    ['inactive dock tab', '#a9a9b4', 'var(--obsidian)'],
  ];
  it.each(text)('%s is at least 4.5:1', (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  const graphics: [string, string, string][] = [
    ['refer now icon on its colour', 'var(--zone-refer-icon)', 'var(--zone-refer)'],
    ['not sure icon on its colour', 'var(--zone-unsure-icon)', 'var(--zone-unsure)'],
    ['low risk icon on its colour', 'var(--zone-low-icon)', 'var(--zone-low)'],
    ['refer now icon on paper', 'var(--zone-refer-icon)', 'var(--paper)'],
    ['not sure icon on paper', 'var(--zone-unsure-icon)', 'var(--paper)'],
    ['low risk icon on paper', 'var(--zone-low-icon)', 'var(--paper)'],
    ['accent icons and focus ring on paper', 'var(--accent)', 'var(--paper)'],
    ['input outline on paper', 'var(--edge)', 'var(--paper)'],
    ['toggle track (off) on paper', 'var(--edge)', 'var(--paper)'],
    ['toggle track (off) on cloud', 'var(--edge)', 'var(--cloud)'],
  ];
  it.each(graphics)('%s is at least 3:1', (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it('zone icons in icons.tsx use the zone icon tokens', () => {
    const icons = readFileSync(join(SRC, 'ui/icons.tsx'), 'utf8');
    const used = /zone === 'refer_now'\) return <\w+ size=\{size\} color="(#\w+)"[\s\S]*?zone === 'unsure'\) return <\w+ size=\{size\} color="(#\w+)"[\s\S]*?return <\w+ size=\{size\} color="(#\w+)"/.exec(icons);
    expect(used?.slice(1)).toEqual([tokens['zone-refer-icon'], tokens['zone-unsure-icon'], tokens['zone-low-icon']]);
  });
});

/** Rules whose only content is an icon: 3:1 is the bar (WCAG 1.4.11), not 4.5:1. */
const ICON_ONLY = ['.empty-mark', '.empty-problem .empty-mark'];

describe('contrast: every rule with its own text colour and solid background', () => {
  const both = rules.filter((r) => r.decl.color && (r.decl.background || r.decl['background-color']) && !/disabled/.test(r.selector))
    .map((r) => ({ ...r, fg: r.decl.color, bg: (r.decl['background-color'] ?? r.decl.background).split(/\s+/)[0] }))
    .filter((r) => hex(r.fg) && hex(r.bg));
  it('finds the rules to check', () => { expect(both.length).toBeGreaterThan(5); });
  it.each(both.map((r) => [r.selector, r.fg, r.bg] as const))('%s has enough contrast', (sel, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(ICON_ONLY.includes(sel) ? 3 : 4.5);
  });
});

// ---- touch targets ----
const px = (v: string | undefined) => (v && /^\d+(\.\d+)?px$/.test(resolve(v)) ? parseFloat(resolve(v)) : null);
const sizeOf = (d: Record<string, string>) => Math.max(px(d['min-height']) ?? 0, px(d.height) ?? 0);

/** Containers whose plain buttons, links or summaries take their size from the container rule. */
const CONTAINED = ['.ages button', '.seg button', '.tools button', '.res button', '.dock a', '.must summary'];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}
const sources = tsxFiles(SRC).map((p) => ({ p: p.slice(SRC.length + 1), s: readFileSync(p, 'utf8') }));
const tags = sources.flatMap(({ p, s }) => [...s.matchAll(/<(button|a|summary)\b([^>]*)>/g)].map((m) => ({ p, tag: m[1], attrs: m[2] })));

/** A selector for the control itself in some state (".btn", ".btn:active", ".seg button[aria-pressed]"), not a part of it (".btn svg", "::after"). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isSelf = (sel: string, base: string) => new RegExp(`^${esc(base)}(\\[[^\\]]*\\]|:(?!:)[\\w-]+(\\([^)]*\\))?)*$`).test(sel.trim());
/** The tallest min-height or height set for a class on its own. */
const own = (cls: string) => Math.max(0, ...rules.filter((r) => r.selector.split(',').some((s) => isSelf(s, `.${cls}`))).map((r) => sizeOf(r.decl)));

describe(`touch targets are at least ${MIN_TARGET}px (NFR-USAB-02)`, () => {
  const classes = [...new Set(tags.flatMap(({ attrs }) => {
    const m = /className=(?:"([^"]*)"|\{`([^`$]*))/.exec(attrs);
    return m ? [(m[1] ?? m[2]).trim().split(/\s+/)] : [];
  }).map((list) => list.join(' ')))];

  it('finds the controls to check', () => { expect(classes.length).toBeGreaterThan(5); });
  it.each(classes)('class "%s" is tall enough', (list) => {
    expect(Math.max(...list.split(' ').map(own))).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it.each(CONTAINED)('"%s" is tall enough', (sel) => {
    const sized = rules.filter((r) => r.selector.split(',').some((s) => s.trim() === sel)).map((r) => sizeOf(r.decl));
    expect(Math.max(0, ...sized)).toBeGreaterThanOrEqual(MIN_TARGET);
  });

  it('no rule makes a control smaller, including inside media queries', () => {
    const watched = [...new Set(classes.flatMap((l) => l.split(' ')))].map((c) => `.${c}`).concat(CONTAINED);
    const shrink = rules.filter((r) => r.selector.split(',').some((s) => watched.some((w) => isSelf(s, w))))
      .filter((r) => ['min-height', 'height'].some((k) => px(r.decl[k]) !== null && px(r.decl[k])! < MIN_TARGET))
      .map((r) => r.selector);
    expect(shrink).toEqual([]);
  });

  it('no inline style on a button or link sets a height under the minimum', () => {
    const small = tags.filter(({ attrs }) => [...attrs.matchAll(/\b(minHeight|height)\s*:\s*(\d+)/g)].some((m) => Number(m[2]) < MIN_TARGET))
      .map(({ p, attrs }) => `${p}: ${attrs.slice(0, 80)}`);
    expect(small).toEqual([]);
  });

  it('plain buttons and links without a class sit in a sized container', () => {
    const bare = sources.flatMap(({ p, s }) => s.split('\n').map((line, i) => ({ p, i, line })))
      .filter(({ line }) => /<(button|a|summary)\b/.test(line) && !/<(button|a|summary)\b[^>]*className=/.test(line));
    const containers = ['ages', 'seg', 'tools', 'res', 'dock', 'must'];
    const lost = bare.filter(({ p, i }) => {
      const before = sources.find((x) => x.p === p)!.s.split('\n').slice(Math.max(0, i - 12), i + 1).join('\n');
      return !containers.some((c) => new RegExp(`className="[^"]*\\b${c}\\b`).test(before));
    }).map(({ p, i, line }) => `${p}:${i + 1} ${line.trim().slice(0, 60)}`);
    expect(lost).toEqual([]);
  });
});

// Motion that must keep working on a phone (Android's "Remove animations" and battery saver switch
// prefers-reduced-motion on, and sheets used to just appear; a finished animation with fill-mode
// "both" also overrides the inline transform that the drag uses).
describe('sheet motion', () => {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const rule = (sel: RegExp) => rules.filter((x) => sel.test(x.split('{')[0].trim()));

  it('animations on dragged panels do not keep a final transform that beats the drag', () => {
    for (const sel of [/^\.sheet$/, /^\.pane$/]) {
      const body = rule(sel)[0].split('{')[1]; // the base rule, not the opacity-only reduced-motion one
      expect(body, String(sel)).toMatch(/animation:[^;]*\bbackwards\b/);
      expect(body, String(sel)).not.toMatch(/animation:[^;]*\b(both|forwards)\b/);
    }
  });

  it('keeps a short slide for sheets under reduced motion instead of removing it', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.sheet\s*\{[^}]*animation:\s*rise\s+(1\d\d|2\d\d)ms/);
  });
});
