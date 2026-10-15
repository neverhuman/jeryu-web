import { expect, test } from './fixtures/test';
import { persistRenderedEvidence } from './fixtures/accessibility';
import { mockBootstrap } from './fixtures/mocks';
import { mockPipelineApi } from './fixtures/pipelineMocks';
import { mockShiftApi, SHIFT_TODOS } from './fixtures/shiftMocks';

const ID = '20261001-000000-aaaaaa';

test('record a hypothesis check and read it again @action:shift.outcome_check', async ({ page }) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await mockPipelineApi(page);
  await mockShiftApi(page);
  let todo = { ...SHIFT_TODOS[0], id: ID, family: 'acme', title: 'Improve checkout', repos: ['widget'], status: 'done',
    hypothesis: 'Users finish checkout faster.', check_after: 7 as string | number, outcome: 'not_checked', outcome_note: '' };
  const posts: unknown[] = [];
  await page.route('**/api/v1/shift/todos**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      posts.push(body);
      todo = { ...todo, ...body.value };
      await route.fulfill({ json: todo });
    } else if (new URL(route.request().url()).pathname.endsWith('/comments')) {
      await route.fulfill({ json: { comments: [], total: 0 } });
    } else {
      await route.fulfill({ json: { generated_at: new Date().toISOString(), todos: [todo], total: 1 } });
    }
  });
  await page.goto(`/work/${ID}`);
  const section = page.getByRole('region', { name: 'Hypothesis and outcome' });
  await expect(section).toContainText('7 days after deploy');
  await section.getByRole('button', { name: 'Edit outcome check' }).click();
  await section.getByLabel('Check after', { exact: true }).fill('2026-10-15');
  await section.getByLabel('Outcome', { exact: true }).selectOption('met');
  await section.getByLabel('Outcome note').fill('Median checkout time fell.');
  await section.getByRole('button', { name: 'Save outcome check' }).click();
  await expect(section).toContainText('Median checkout time fell.');
  expect(posts).toEqual([{ action: 'outcome_check', value: { hypothesis: 'Users finish checkout faster.', check_after: '2026-10-15', outcome: 'met', outcome_note: 'Median checkout time fell.' } }]);
  await page.reload();
  await expect(section).toContainText('Median checkout time fell.');
  await expect(section).toContainText('Outcome: met');
  await persistRenderedEvidence(page, 'hypothesis-work');
});

test('monthly Outcomes exposes missing hypotheses and both shares @action:scorecard.hypothesis_checks', async ({ page }) => {
  await mockBootstrap(page, { auth: { role: 'admin' } });
  await page.route('**/api/v1/scorecard**', async (route) => route.fulfill({ json: {
    schema_version: 'jeryu.scorecard/v1', generated_at: '2026-10-15T12:00:00Z', window: '30d', family: null, repo: null,
    metrics: { hypotheses_checked_and_met: { value: { month: '2026-10', shipped: 4, with_hypothesis: 3, without_hypothesis: 1,
      without_check_date: 0, eligible: 3, checked: 2, met: 1, checked_share_pct: 66.6667, met_share_pct: 50 },
      previous: null, daily: [], sample_size: 3, source: 'invented records', unknown: null,
      detail: { rows: [{ id: ID, family: 'acme', title: 'Improve checkout', href: `/work/${ID}`, hypothesis: 'Users finish checkout faster.', outcome: 'met', outcome_note: 'Median checkout time fell.', check_due_at: '2026-10-15T00:00:00Z' }], total_rows: 1 } } },
  } }));
  await page.goto('/scorecard?tab=outcomes');
  const outcomes = page.getByTestId('monthly-hypotheses');
  await expect(outcomes).toContainText('1 without a hypothesis');
  await expect(outcomes).toContainText('2 of 3 due checks recorded (66.7%)');
  await expect(outcomes).toContainText('1 met (50.0% of checked)');
  await expect(outcomes.getByRole('link', { name: 'Improve checkout' })).toHaveAttribute('href', `/work/${ID}`);
  await persistRenderedEvidence(page, 'hypothesis-scorecard');
});
