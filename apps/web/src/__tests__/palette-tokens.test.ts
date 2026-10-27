// palette-tokens.test.ts — the palette keeps the promises tokens.css makes.
//
// One accent and four status hues, in every theme: each theme block declares
// them, every text/status pair clears WCAG AA (4.5:1) on the page and on its
// own tint, the extra chart series stays apart from its neighbours in
// lightness, and the retired tokens (a second accent, gold, the background
// grid, the glows) are referenced nowhere in the stylesheets or the code.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const tokensCss = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');

type Rgb = [number, number, number];

/** The declarations of one theme block, by name. */
function declarations(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) found.set(match[1], match[2].trim());
  return found;
}

/** A tokens.css block after its prelude, up to the end of its declarations. */
function block(prelude: string): Map<string, string> {
  const at = tokensCss.indexOf(prelude);
  expect(at, `${prelude} is declared in tokens.css`).toBeGreaterThan(-1);
  const rest = tokensCss.slice(at + prelude.length);
  return declarations(rest.slice(0, rest.indexOf('color-scheme:')));
}

/** The dark theme is the bare `:root` block that ends in `color-scheme: dark`. */
function darkRoot(): Map<string, string> {
  const end = tokensCss.indexOf('color-scheme: dark;');
  const start = tokensCss.lastIndexOf(':root {', end);
  return declarations(tokensCss.slice(start, end));
}

const THEMES: Array<[name: string, tokens: Map<string, string>]> = [
  ['dark', darkRoot()],
  ['light (prefers-color-scheme)', block('@media (prefers-color-scheme: light) {')],
  ['explicit dark', block("[data-theme='dark'] {")],
  ['explicit light', block("[data-theme='light'] {")],
  ['high contrast', block("[data-theme='high-contrast'] {")],
];

const STATUS = ['success', 'warning', 'danger', 'info'];

function colour(value: string | undefined, name: string): { rgb: Rgb; alpha: number } {
  expect(value, `${name} is declared`).toBeDefined();
  const text = value ?? '';
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = text.match(/^rgba?\(([^)]+)\)$/);
  expect(rgba, `${name} is a hex or rgba colour, got ${text}`).not.toBeNull();
  const parts = (rgba?.[1] ?? '').split(',').map((part) => Number.parseFloat(part));
  return { rgb: [parts[0], parts[1], parts[2]], alpha: parts.length > 3 ? parts[3] : 1 };
}

function over(top: { rgb: Rgb; alpha: number }, under: Rgb): Rgb {
  const mix = (k: number): number => Math.round(top.rgb[k] * top.alpha + under[k] * (1 - top.alpha));
  return [mix(0), mix(1), mix(2)];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('palette tokens', () => {
  it.each(THEMES)('%s: text and status pairs clear AA on the page and on their tint', (_name, tokens) => {
    const page = colour(tokens.get('--color-bg-0'), '--color-bg-0').rgb;
    for (const text of ['--color-fg-primary', '--color-fg-secondary', '--color-fg-muted', '--color-accent-primary']) {
      expect(contrast(colour(tokens.get(text), text).rgb, page), `${text} on the page`).toBeGreaterThanOrEqual(4.5);
    }
    for (const status of STATUS) {
      const name = `--color-accent-${status}`;
      const ink = colour(tokens.get(name), name).rgb;
      const tint = over(colour(tokens.get(`${name}-bg`), `${name}-bg`), page);
      expect(contrast(ink, page), `${name} on the page`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, tint), `${name} on its tint`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(THEMES)('%s: the extra chart series stands apart from the page and its neighbours', (_name, tokens) => {
    const page = colour(tokens.get('--color-bg-0'), '--color-bg-0').rgb;
    const alt = colour(tokens.get('--color-chart-alt'), '--color-chart-alt').rgb;
    expect(contrast(alt, page)).toBeGreaterThanOrEqual(3);
    for (const other of ['--color-accent-primary', '--color-accent-info', '--color-accent-success']) {
      expect(contrast(alt, colour(tokens.get(other), other).rgb), `chart-alt beside ${other}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('references no retired token anywhere in the app', () => {
    const retired = /--color-accent-secondary|--color-gold|--shadow-gold|--color-grid|--glow-/;
    const offenders: string[] = [];
    for (const entry of readdirSync(SRC, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(css|ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      if (retired.test(readFileSync(path, 'utf8'))) offenders.push(path.slice(SRC.length + 1));
    }
    expect(offenders).toEqual([]);
  });
});
