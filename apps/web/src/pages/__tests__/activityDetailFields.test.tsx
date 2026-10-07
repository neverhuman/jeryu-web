// activityDetailFields.test.tsx — the open row: the few fields the producer
// attached that this kind is asked about, the join keys each said in words
// rather than in the wire's, and the one field handed over whole.

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventRow } from '../activity';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';
import type { PipelineEvent } from '../../api/types';

function renderRow(event: PipelineEvent): void {
  mockPipelineApi();
  renderAt(
    '/activity',
    '/activity',
    <ul>
      <EventRow event={event} defaultOpen />
    </ul>
  );
}

/** The label-above-value pairs of one list, as `Label: value`. */
function pairs(testId: string): string[] {
  const list = screen.getByTestId(testId);
  return Array.from(list.querySelectorAll('.activity-row__field')).map(
    (field) =>
      `${field.querySelector('dt')?.textContent}: ${field.querySelector('dd')?.textContent}`
  );
}

const STAGE = pipelineEvent({
  seq: 5,
  kind: 'worker.stage',
  source: 'forge',
  actor: 'alton@xbabe0/w2',
  outcome: 'gate',
  summary: 'w2 jeryu: agent -> gate on 20260919-0800-aaa',
  detail: { stage: 'gate', slot: 'w2', runner: 'xbabe0', head_sha: 'b761244b76371995527bfe7795e98492703553a8' },
});

describe('EventRow detail fields', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the join keys instead of leaving them as wire words', async () => {
    renderRow(STAGE);
    await waitFor(() => expect(screen.getByTestId('activity-event-5')).toBeTruthy());
    const facts = Array.from(
      screen.getByTestId('activity-event-5').querySelectorAll('.activity-row__facts .activity-row__field dt')
    ).map((term) => term.textContent);
    expect(facts).toEqual(['Source', 'Kind', 'Outcome', 'Actor']);
  });

  it('shows a stage beat the fields it was opened for', async () => {
    renderRow(STAGE);
    await waitFor(() => expect(screen.getByTestId('activity-event-fields-5')).toBeTruthy());
    expect(pairs('activity-event-fields-5')).toEqual([
      'Stage: gate',
      'Slot: w2',
      'Runner: xbabe0',
      'Head: b761244b',
    ]);
  });

  it('hands the deploy command of a staged release over in one click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderRow(
      pipelineEvent({
        seq: 6,
        kind: 'release.staged',
        source: 'auto-stage',
        summary: 'Staged prod-20260919T130210Z-01dfe68-unsigned',
        detail: {
          release: 'prod-20260919T130210Z-01dfe68-unsigned',
          deploy_command: 'jeryu deploy prod-20260919T130210Z-01dfe68-unsigned',
        },
      })
    );
    const copy = await screen.findByTestId('activity-event-field-copy-6-deploy_command');
    fireEvent.click(copy);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('jeryu deploy prod-20260919T130210Z-01dfe68-unsigned')
    );
  });

  it('keeps the toggle on a row whose only extra is a field', async () => {
    mockPipelineApi();
    renderAt(
      '/activity',
      '/activity',
      <ul>
        <EventRow event={STAGE} />
      </ul>
    );
    const toggle = await screen.findByRole('button', { name: 'More for event 5' });
    expect(toggle.className).not.toContain('activity-row__toggle--quiet');
    fireEvent.click(toggle);
    expect(pairs('activity-event-fields-5')[0]).toBe('Stage: gate');
  });
});
