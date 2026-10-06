// 45-dropdown-theme.spec.ts — the open list of a native dropdown follows the
// shell theme.
//
// The reset leaves every select transparent, so the browser painted the open
// list in its light default while the options inherited the dark theme's
// light text: unreadable. Options now take the theme's surface and text
// tokens, and repaint when the theme changes without a reload.

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/test';

import { AppShellPage } from './pages/AppShellPage';

import { mockBootstrap, mockRepoList } from './fixtures/mocks';

/** Pin the shell theme before the app boots. */
async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    ['jeryu.preferences.v2', JSON.stringify({ theme })] as const
  );
}

/** Relative luminance (WCAG) of a computed `rgb()` / `rgba()` color. */
function luminance(color: string): number {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((part) => {
    const c = Number(part) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The colors the browser paints the sort dropdown's open list with. */
async function optionColors(page: Page) {
  return page.locator('#repos-sort option').first().evaluate((option) => {
    const style = getComputedStyle(option);
    return {
      background: style.backgroundColor,
      text: style.color,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  });
}

async function switchTheme(page: Page, title: 'Theme: Light' | 'Theme: Dark') {
  await page.getByRole('button', { name: /^Search or jump to/ }).click();
  await page.getByRole('combobox', { name: 'Command palette' }).fill(title);
  await page.getByRole('option', { name: title, exact: true }).click();
}

test.describe('Dropdown theme', () => {
  test('a dropdown list is dark in the dark theme and follows a switch to light and back @action:shell.dropdown_theme', async ({
    page,
  }) => {
    await useTheme(page, 'dark');
    await mockBootstrap(page);
    await mockRepoList(page, []);
    const shell = new AppShellPage(page);

    await page.goto('/repos');
    await shell.assertShellLoaded(15_000);

    // 1. Dark: a dark list with readable text.
    const dark = await optionColors(page);
    expect(dark.theme).toBe('dark');
    // Transparent means the browser picks the color, which is how the list went light.
    expect(dark.background, 'the open list must have its own color').toMatch(/^rgb\(/);
    expect(luminance(dark.background), 'the open list must be dark').toBeLessThan(0.05);
    expect(contrast(dark.background, dark.text)).toBeGreaterThanOrEqual(7);

    // 2. Switch to light without a reload: the list turns light.
    await switchTheme(page, 'Theme: Light');
    await expect.poll(async () => (await optionColors(page)).theme).toBe('light');
    const light = await optionColors(page);
    expect(light.background).toMatch(/^rgb\(/);
    expect(luminance(light.background), 'the open list must be light').toBeGreaterThan(0.8);
    expect(contrast(light.background, light.text)).toBeGreaterThanOrEqual(7);

    // 3. And back to dark.
    await switchTheme(page, 'Theme: Dark');
    await expect.poll(async () => (await optionColors(page)).theme).toBe('dark');
    expect(await optionColors(page)).toEqual(dark);
  });
});
