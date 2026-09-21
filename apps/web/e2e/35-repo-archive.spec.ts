// 35-repo-archive.spec.ts — archive a repository from its Settings.
//
// Settings → Danger zone shows an "Archive" section above the danger zone:
// one button, one sentence (read-only, reversible, nothing is deleted) and a
// confirm step that names the repository. The PATCH is mocked by
// `mockArchiveRepo`, which captures the body. An archived repository carries
// an "Archived" badge in its header and on the Repositories list under the
// Archived filter; a 403 for a non-admin stays in the dialog.

import { expect, test } from './fixtures/test';

import {
  mockArchiveRepo,
  mockBootstrap,
  mockReadme,
  mockRefs,
  mockRepoList,
  mockSettings,
} from './fixtures/mocks';

test.describe.configure({ retries: 1 });

const REPO = {
  id: { host: 'jeryu', owner: 'veox', name: 'redline' },
  default_branch: 'main',
  description: 'Edge router for VEOX.',
  visibility: 'internal' as const,
};
const FULL_NAME = 'veox/redline';

async function openSettings(
  page: import('@playwright/test').Page,
  archived: boolean,
  opts: Parameters<typeof mockArchiveRepo>[1] = {}
): Promise<Awaited<ReturnType<typeof mockArchiveRepo>>> {
  await mockBootstrap(page);
  await mockRepoList(page, [{ ...REPO, archived }]);
  await mockRefs(page);
  await mockReadme(page, { html: '<h1>redline</h1>' });
  await mockSettings(page);
  const captured = await mockArchiveRepo(page, opts);
  await page.goto('/repos/jeryu/veox/redline/settings/danger-zone');
  await expect(page.getByTestId('repo-archive-section')).toBeVisible({
    timeout: 10_000,
  });
  return captured;
}

test.describe('Repository archive', () => {
  test('archive confirms by name and sends archived: true @action:repo.archive', async ({
    page,
  }) => {
    const captured = await openSettings(page, false);
    const section = page.getByTestId('repo-archive-section');
    await expect(section).toContainText('Nothing is deleted');
    await expect(section.getByRole('button')).toHaveCount(1);
    // The Archive section sits above the danger zone.
    const archiveBox = await section.boundingBox();
    const dangerBox = await page.getByTestId('repo-danger-zone').boundingBox();
    expect(archiveBox!.y).toBeLessThan(dangerBox!.y);

    await section
      .getByRole('button', { name: 'Archive this repository' })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(FULL_NAME);
    expect(captured).toHaveLength(0);
    await dialog.getByRole('button', { name: `Archive ${FULL_NAME}` }).click();

    await expect(dialog).toBeHidden();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toContain('/api/v1/repos/');
    expect(captured[0]!.body).toEqual({ archived: true });
  });

  test('an archived repository shows the badge and unarchives @action:repo.unarchive', async ({
    page,
  }) => {
    const captured = await openSettings(page, true);
    await page
      .getByTestId('repo-archive-section')
      .getByRole('button', { name: 'Unarchive' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: `Unarchive ${FULL_NAME}` })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(captured[0]!.body).toEqual({ archived: false });

    await page.goto('/repos/jeryu/veox/redline');
    await expect(
      page.locator('.repo-overview__head').getByText('Archived', { exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await page.goto('/repos');
    await page.getByLabel('Archived').check();
    await expect(
      page.getByTestId(`repo-link-${FULL_NAME}`)
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.repo-archived-badge').first()).toHaveText(
      'Archived'
    );
  });

  test('a non-admin is refused with 403 inside the dialog @action:repo.archive_forbidden', async ({
    page,
  }) => {
    const captured = await openSettings(page, false, {
      error: {
        status: 403,
        code: 'forbidden',
        message: 'admin role required to archive or unarchive a repository',
      },
    });
    await page
      .getByTestId('repo-archive-section')
      .getByRole('button', { name: 'Archive this repository' })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: `Archive ${FULL_NAME}` }).click();
    await expect(dialog.getByRole('alert')).toContainText('admin role required');
    await expect(dialog).toBeVisible();
    expect(captured).toHaveLength(1);
  });
});
