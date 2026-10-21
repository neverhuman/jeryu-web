// 46-list-keys.spec.ts — keyboard operation of the lists: `j`/`k` move a
// visible focus row, `o` or Enter open the focused row, `x` runs its one
// action, and the shortcuts overlay lists all four.
//
// Needs you is the fixture under test (invented families only): `j j Enter`
// must land on the second row's own href.

import { expect, test } from './fixtures/test';

import { mockBootstrap } from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';

test.describe('Keyboard operation of lists', () => {
  test('j moves the focus row and Enter opens it @action:lists.keyboard_rows', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/blocked');
    await expect(page.getByTestId('needs-you-page')).toBeVisible({ timeout: 15_000 });

    // `:visible` because the "worth a look" rows are folded away in a closed
    // `details`, which is exactly what the keys skip.
    const rows = page.locator('[data-list-row]:visible');
    await expect(rows.first()).toBeVisible();

    // First `j` takes the top row; the ring says which row the keys act on.
    await page.keyboard.press('j');
    await expect(rows.nth(0)).toHaveAttribute('data-list-focused', 'true');
    await page.keyboard.press('j');
    await expect(rows.nth(1)).toHaveAttribute('data-list-focused', 'true');
    await expect(rows.nth(0)).not.toHaveAttribute('data-list-focused', 'true');

    // The second row's own href, taken from the row rather than assumed.
    const href = await rows.nth(1).locator('[data-list-open]').getAttribute('href');
    expect(href).toBeTruthy();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test('the shortcuts overlay lists the list keys @action:lists.keyboard_help', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/blocked');
    await expect(page.getByTestId('needs-you-page')).toBeVisible({ timeout: 15_000 });

    // `k` with nothing focused starts at the bottom of the list and walks up.
    const rows = page.locator('[data-list-row]:visible');
    await expect(rows.first()).toBeVisible();
    await page.keyboard.press('k');
    await expect(rows.last()).toHaveAttribute('data-list-focused', 'true');
    await page.keyboard.press('k');
    await expect(rows.nth(-2)).toHaveAttribute('data-list-focused', 'true');

    await page.getByRole('button', { name: /^Account:/ }).click();

    // Through the account menu, the one control that opens it by name.
    await page.getByTestId('account-menu-shortcuts').click();
    const overlay = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(overlay).toBeVisible();
    for (const label of [
      'Next row in a list',
      'Previous row in a list',
      'Open the focused row',
      "Run the focused row's action",
    ]) {
      await expect(overlay.getByText(label).first()).toBeVisible();
    }
  });

  test('x runs the focused row\'s one action @action:lists.keyboard_action', async ({
    page,
  }) => {
    await mockBootstrap(page, { auth: { role: 'admin' } });
    await mockPipelineApi(page);

    await page.goto('/blocked');
    await expect(page.getByTestId('needs-you-page')).toBeVisible({ timeout: 15_000 });

    // The staged release row's act happens off-site: `x` copies its command.
    const staged = page.getByTestId('needs-you-item-release_staged:jeryu/jeryu-deploy');
    await expect(staged).toBeVisible();
    await staged.focus();
    await page.keyboard.press('x');
    await expect(staged.getByRole('status')).toHaveText(/Copied|Select and copy/);
  });
});
