import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PullRequestChecks } from '../../../api/types';
import { ChecksPanel } from '../ChecksPanel';

const checks = {
  passing: 1,
  failing: 1,
  pending: 0,
  skipped: 0,
  checks: [
    { id: 1, name: 'ci/build', status: 'success' },
    { id: 2, name: 'jankurai/proof', status: 'failure', description: 'score 72 below threshold 85' },
    { id: 3, name: 'jeryu/autonomy', status: null },
  ],
} as unknown as PullRequestChecks;

function row(name: string): HTMLElement {
  return screen.getByText(name, { exact: false }).closest('li') as HTMLElement;
}

describe('ChecksPanel', () => {
  it('gives every check a visible status word, including one with no status', () => {
    render(<ChecksPanel checks={checks} />);
    expect(within(row('ci/build')).getByText('passing')).toBeTruthy();
    expect(within(row('jankurai/proof')).getByText('failing')).toBeTruthy();
    expect(within(row('jeryu/autonomy')).getByText('no status reported')).toBeTruthy();
  });

  it('shows the full failure reason and the not-required note', () => {
    render(<ChecksPanel checks={checks} failuresBlockMerge={false} />);
    const failing = row('jankurai/proof');
    expect(within(failing).getByText('failing, not required')).toBeTruthy();
    expect(within(failing).getByText('It does not block the merge.')).toBeTruthy();
    expect(within(failing).getByText('score 72 below threshold 85')).toBeTruthy();
  });
});
