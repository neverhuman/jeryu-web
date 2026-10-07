// activityProse.test.tsx — the inline Markdown the producers write into an
// event's summary and reason: shown as emphasis, code and links rather than as
// the marks themselves, and never as markup.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EventRow } from '../activity';
import { proseSpans, proseText } from '../activity/proseModel';
import { mockPipelineApi } from './pipelinePageHelpers';
import { renderAt } from './shiftPageHelpers';
import { pipelineEvent } from './pipelineTestData';

function renderRow(partial: Parameters<typeof pipelineEvent>[0]): void {
  mockPipelineApi();
  renderAt(
    '/activity',
    '/activity',
    <ul>
      <EventRow event={pipelineEvent(partial)} defaultOpen />
    </ul>
  );
}

describe('proseSpans', () => {
  it('leaves text without marks as the one span it is', () => {
    expect(proseSpans('Gate failed on jeryu/jeryu-web#35')).toEqual([
      { kind: 'text', text: 'Gate failed on jeryu/jeryu-web#35' },
    ]);
  });

  it('reads the four marks a one-line reason uses', () => {
    expect(proseSpans('**Red team: approved.** run `just required` or _wait_')).toEqual([
      { kind: 'strong', text: 'Red team: approved.' },
      { kind: 'text', text: ' run ' },
      { kind: 'code', text: 'just required' },
      { kind: 'text', text: ' or ' },
      { kind: 'em', text: 'wait' },
    ]);
    expect(proseSpans('__bold__ and *thin*')).toEqual([
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'em', text: 'thin' },
    ]);
  });

  it('keeps the marks inside code as the characters they are', () => {
    expect(proseSpans('run `cargo test -- **`')).toEqual([
      { kind: 'text', text: 'run ' },
      { kind: 'code', text: 'cargo test -- **' },
    ]);
  });

  it('keeps a lone mark literal rather than guessing where it closes', () => {
    expect(proseSpans('2 * 3 stages, 50% done')).toEqual([
      { kind: 'text', text: '2 * 3 stages, 50% done' },
    ]);
  });

  it('takes a link that points at this instance or at the web', () => {
    expect(proseSpans('see [the run](https://ci.example/7)')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', text: 'the run', href: 'https://ci.example/7' },
    ]);
    expect(proseSpans('[todo 4](/todos/4)')).toEqual([
      { kind: 'link', text: 'todo 4', href: '/todos/4' },
    ]);
  });

  it('reads a link we would not follow as the words it is made of', () => {
    expect(proseSpans('press [here](javascript:boom) now')).toEqual([
      { kind: 'text', text: 'press here now' },
    ]);
    expect(proseSpans('[here](data:text/html;base64,x)')).toEqual([{ kind: 'text', text: 'here' }]);
  });

  it('says the same text with its marks taken off', () => {
    expect(proseText('**Red team: approved.** `just required`')).toBe(
      'Red team: approved. just required'
    );
  });
});

describe('EventRow prose', () => {
  it('shows a reason as emphasis and code, not as asterisks', async () => {
    renderRow({
      seq: 7,
      kind: 'gate.finished',
      summary: 'Gate finished',
      reason: '**Red team: approved.** Re-run `just required` before landing.',
    });
    const reason = (await screen.findByTestId('activity-event-7')).querySelector(
      '.activity-row__reason'
    );
    expect(reason?.textContent).toBe('Red team: approved. Re-run just required before landing.');
    expect(reason?.textContent).not.toContain('*');
    expect(reason?.querySelector('strong')?.textContent).toBe('Red team: approved.');
    expect(reason?.querySelector('code')?.textContent).toBe('just required');
  });

  it('does not let a reason bring its own markup', async () => {
    renderRow({
      seq: 8,
      kind: 'gate.finished',
      reason: 'rejected by <img src=x onerror="boom()"> the red team',
    });
    const reason = (await screen.findByTestId('activity-event-8')).querySelector(
      '.activity-row__reason'
    );
    expect(reason?.querySelector('img')).toBeNull();
    expect(reason?.textContent).toContain('<img src=x onerror="boom()">');
  });

  it('keeps the subject a link when the summary is emphasised around it', async () => {
    renderRow({
      seq: 9,
      kind: 'gate.finished',
      repo: 'jeryu/jeryu-web',
      pr: 35,
      summary: '**Gate failed on jeryu/jeryu-web#35**',
    });
    const summary = (await screen.findByTestId('activity-event-9')).querySelector(
      '.activity-row__summary'
    );
    expect(summary?.textContent).toBe('Gate failed on jeryu/jeryu-web#35');
    const link = summary?.querySelector('a');
    expect(link?.textContent).toBe('jeryu/jeryu-web#35');
    expect(link?.getAttribute('href')).toContain('35');
    // The emphasis the writer put around the sentence is still on the words.
    expect(summary?.querySelector('strong')?.textContent).toBe('Gate failed on ');
  });

  it('follows a summary that does not name its subject with the link', async () => {
    renderRow({
      seq: 10,
      kind: 'gate.finished',
      repo: 'jeryu/jeryu-web',
      pr: 35,
      summary: '*Gate failed*',
    });
    const summary = (await screen.findByTestId('activity-event-10')).querySelector(
      '.activity-row__summary'
    );
    expect(summary?.textContent).toBe('Gate failed jeryu/jeryu-web#35');
    expect(summary?.querySelector('em')?.textContent).toBe('Gate failed');
    expect(summary?.querySelector('a')?.textContent).toBe('jeryu/jeryu-web#35');
  });
});
