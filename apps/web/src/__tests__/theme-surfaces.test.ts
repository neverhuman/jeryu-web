// theme-surfaces.test.ts — the three theme surfaces agree on the page colour.
//
// A theme lives in three places: the boot `<style>` in index.html paints a
// literal before any CSS loads, `styles/tokens.css` owns `--color-bg-0` per
// theme, and `styles/app.css` hands `html` and `body` that token. When one of
// them keeps a colour of its own the page splits: a daylight browser gets a
// near-black canvas behind a light body, or a dark first paint before the
// light tokens arrive. This test reads the three files and pins them together.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..', '..');
const SRC = join(__dirname, '..');

const indexHtml = readFileSync(join(WEB, 'index.html'), 'utf8');
const tokensCss = readFileSync(join(SRC, 'styles', 'tokens.css'), 'utf8');
const appCss = readFileSync(join(SRC, 'styles', 'app.css'), 'utf8');
const readme = readFileSync(join(WEB, 'README.md'), 'utf8');

/** The tokens every theme block has to redefine for the surface to hold. */
const THEME_TOKENS = [
  '--color-bg-0',
  '--color-bg-1',
  '--color-fg-primary',
  '--color-border-subtle',
];

/**
 * The body of a tokens.css block, by its selector or at-rule prelude. The
 * light theme nests `:root` inside a media query, so take everything up to
 * the blank line that ends the declarations.
 */
function block(prelude: string): string {
  const at = tokensCss.indexOf(prelude);
  expect(at, `${prelude} is declared in tokens.css`).toBeGreaterThan(-1);
  const rest = tokensCss.slice(at + prelude.length);
  const end = rest.indexOf('\n}\n\n/*');
  return end === -1 ? rest : rest.slice(0, end);
}

/** The value of `--color-bg-0` inside a tokens.css block. */
function pageColor(prelude: string): string {
  const found = /--color-bg-0:\s*([^;]+);/.exec(block(prelude));
  expect(found, `${prelude} sets --color-bg-0`).not.toBeNull();
  return (found as RegExpExecArray)[1].trim();
}

/**
 * The dark theme is the bare `:root` block, so it has no prelude of its own to
 * search for: read it back from the `color-scheme: dark` that closes it.
 */
function darkRootPageColor(): string {
  const head = tokensCss.slice(0, tokensCss.indexOf('color-scheme: dark;'));
  const found = [...head.matchAll(/--color-bg-0:\s*([^;]+);/g)].pop();
  expect(found, ':root sets --color-bg-0').not.toBeUndefined();
  return (found as RegExpMatchArray)[1].trim();
}

const THEMES: Array<[name: string, prelude: string]> = [
  ['light (prefers-color-scheme)', '@media (prefers-color-scheme: light) {'],
  ['explicit dark', "[data-theme='dark'] {"],
  ['explicit light', "[data-theme='light'] {"],
  ['high contrast', "[data-theme='high-contrast'] {"],
];

describe('theme surfaces', () => {
  it.each(THEMES)('%s redefines the surface tokens', (_name, prelude) => {
    const body = block(prelude);
    for (const token of THEME_TOKENS) {
      expect(body, `${prelude} sets ${token}`).toContain(`${token}:`);
    }
  });

  it('serves light tokens off prefers-color-scheme, not only off data-theme', () => {
    expect(tokensCss).toContain('@media (prefers-color-scheme: light)');
    expect(pageColor('@media (prefers-color-scheme: light) {')).not.toBe(
      pageColor("[data-theme='dark'] {")
    );
  });

  it('gives html and body the page token, never a literal', () => {
    const htmlRule = /\nhtml \{([^}]*)\}/.exec(appCss);
    expect(htmlRule, 'app.css has an html rule').not.toBeNull();
    expect((htmlRule as RegExpExecArray)[1]).toContain(
      'background-color: var(--color-bg-0)'
    );
    const bodyRule = /\nbody \{([^}]*)\}/.exec(appCss);
    expect(bodyRule, 'app.css has a body rule').not.toBeNull();
    expect((bodyRule as RegExpExecArray)[1]).toContain(
      'background-color: var(--color-bg-0)'
    );
  });

  it('boots on the colour the matching theme then keeps', () => {
    // The dark literal is the unconditional boot paint; the light one sits
    // behind the same media query tokens.css uses.
    const boot = /<style>([\s\S]*?)<\/style>/.exec(indexHtml);
    expect(boot, 'index.html paints a boot background').not.toBeNull();
    const style = (boot as RegExpExecArray)[1];
    const [dark, light] = [...style.matchAll(/background:\s*([^;]+);/g)].map(
      (m) => m[1].trim()
    );
    expect(style).toContain('@media (prefers-color-scheme: light)');
    expect(dark).toBe(darkRootPageColor());
    expect(light).toBe(pageColor('@media (prefers-color-scheme: light) {'));
  });

  it('answers the same question from the theme-color meta tags', () => {
    expect(indexHtml).toContain('media="(prefers-color-scheme: dark)"');
    expect(indexHtml).toContain('media="(prefers-color-scheme: light)"');
  });

  it('documents that the shipped default is dark, not the OS preference', () => {
    expect(readme).toMatch(/shipped default is \*\*dark\*\*/);
    expect(readme).toContain('@media (prefers-color-scheme: light)');
    expect(readme).not.toContain('`:root` | Light theme (default).');
  });
});
