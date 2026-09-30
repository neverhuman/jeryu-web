// The wording of the repository page's Automation and Mirrors sections.
// The repositories, identities and targets below are invented.

import { describe, expect, it } from 'vitest';

import type {
  AutomationActor,
  AutomationCheck,
  AutomationMirror,
  RepoAutomation,
} from '../../api/types';
import {
  actorKindText,
  actorTone,
  checkStatusText,
  checkTone,
  emptyAutomationText,
  grantText,
  hasAutomation,
  lastRunText,
  mirrorStatusText,
  mirrorTone,
  orderedActors,
  requiredText,
  shortSha,
} from '../repoAutomationModel';

const check = (over: Partial<AutomationCheck> = {}): AutomationCheck => ({
  name: 'jankurai/proof',
  required: true,
  state: 'reported',
  lastConclusion: 'success',
  ...over,
});

const actor = (over: Partial<AutomationActor> = {}): AutomationActor => ({
  kind: 'merger',
  identity: 'jain-merge-bot',
  role: 'merges approved pull requests',
  state: 'configured',
  ...over,
});

describe('checks', () => {
  it('reads a run by its conclusion and a required context nobody runs as a problem', () => {
    expect(checkTone(check())).toBe('ok');
    expect(checkTone(check({ lastConclusion: 'failure' }))).toBe('bad');
    expect(checkTone(check({ lastConclusion: 'in_progress' }))).toBe('waiting');
    expect(checkTone(check({ state: 'missing', lastConclusion: null }))).toBe(
      'bad'
    );
    // A check nobody requires that has not run is a fact, not a failure.
    expect(
      checkTone(
        check({ state: 'missing', required: false, lastConclusion: null })
      )
    ).toBe('waiting');
  });

  it('says what a check did, including when it never did anything', () => {
    expect(checkStatusText(check())).toBe('success');
    expect(checkStatusText(check({ state: 'missing' }))).toBe('never reported');
    expect(checkStatusText(check({ lastConclusion: null }))).toBe(
      'no conclusion yet'
    );
    expect(requiredText(check())).toBe('Required');
    expect(requiredText(check({ required: false }))).toBe('Not required');
  });
});

describe('actors', () => {
  it('states a grant that is there, and the server sentence for one that is not', () => {
    expect(
      grantText(actor({ grant: { required: 'write', present: true, held: 'write' } }))
    ).toBe('write grant ✓');
    expect(
      grantText(
        actor({ grant: { required: 'write', present: true, held: 'admin' } })
      )
    ).toBe('write grant ✓ (holds admin)');
    expect(
      grantText(
        actor({
          grant: {
            required: 'write',
            present: false,
            warning: 'jain-merge-bot has no write grant on acme/widget-www; its merges answer 403',
          },
        })
      )
    ).toContain('403');
    // No grant field at all (a runner) says nothing rather than guessing.
    expect(grantText(actor({ kind: 'gate-runner' }))).toBeNull();
  });

  it('marks a missing grant and an offline reporter as needing a person', () => {
    expect(actorTone(actor({ grant: { required: 'write', present: false } }))).toBe(
      'bad'
    );
    expect(actorTone(actor({ kind: 'deployer', state: 'offline' }))).toBe('bad');
    expect(
      actorTone(actor({ grant: { required: 'write', present: true } }))
    ).toBe('ok');
  });

  it('says what an actor last did, with the target of a deploy', () => {
    expect(
      lastRunText(
        actor({
          kind: 'deployer',
          lastRun: {
            conclusion: 'deployed',
            at: '2026-09-30T12:00:00Z',
            sha: '1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21',
            target: 'edge-pages',
          },
        })
      )
    ).toBe('deployed 1f0c9a4 to edge-pages');
    expect(
      lastRunText(
        actor({
          kind: 'gate-runner',
          lastRun: { conclusion: 'success', at: 'x', sha: 'abc1234', pr: 31 },
        })
      )
    ).toBe('success abc1234 #31');
    expect(lastRunText(actor())).toBeNull();
  });

  it('lists the reviewer and the merger before the machines', () => {
    const order = orderedActors([
      actor({ kind: 'deployer', identity: 'buildhost1/publish' }),
      actor({ kind: 'gate-runner', identity: 'buildhost2/slot0' }),
      actor({ kind: 'merger', identity: 'jain-merge-bot' }),
      actor({ kind: 'reviewer', identity: 'pragent' }),
    ]).map((entry) => entry.identity);
    expect(order).toEqual([
      'pragent',
      'jain-merge-bot',
      'buildhost2/slot0',
      'buildhost1/publish',
    ]);
    expect(actorKindText('gate-runner')).toBe('Gate runner');
    expect(actorKindText('something-new')).toBe('Automation');
  });
});

describe('mirrors', () => {
  const mirror = (over: Partial<AutomationMirror> = {}): AutomationMirror => ({
    target: 'https://example.invalid/acme-oss/widget-www',
    direction: 'push',
    refs: ['refs/heads/main'],
    state: 'in_sync',
    behind: false,
    ...over,
  });

  it('reads a level mirror as fine and a behind or failing one as not', () => {
    expect(mirrorTone(mirror())).toBe('ok');
    expect(mirrorTone(mirror({ state: 'behind', behind: true }))).toBe('bad');
    expect(mirrorTone(mirror({ lastError: 'push rejected' }))).toBe('bad');
    expect(mirrorTone(mirror({ state: 'unknown' }))).toBe('waiting');
  });

  it('says where a mirror stands in words', () => {
    expect(mirrorStatusText(mirror())).toBe('level with the forge');
    expect(mirrorStatusText(mirror({ state: 'behind' }))).toBe(
      'behind the forge'
    );
    expect(mirrorStatusText(mirror({ state: 'diverged' }))).toBe(
      'diverged from the forge'
    );
    expect(mirrorStatusText(mirror({ state: 'unknown' }))).toBe('not read yet');
  });
});

describe('the whole view', () => {
  const view = (over: Partial<RepoAutomation> = {}): RepoAutomation => ({
    repo: 'acme/widget-www',
    defaultBranch: 'main',
    checks: [],
    requiredContexts: [],
    actors: [],
    mirrors: [],
    grants: [],
    grantsVisible: false,
    warnings: [],
    ...over,
  });

  it('names the repository when nothing is registered', () => {
    expect(hasAutomation(view())).toBe(false);
    expect(emptyAutomationText(view())).toContain('acme/widget-www');
    expect(hasAutomation(view({ checks: [check()] }))).toBe(true);
    expect(hasAutomation(view({ actors: [actor()] }))).toBe(true);
  });

  it('shortens a sha and leaves a short one alone', () => {
    expect(shortSha('1f0c9a4b2d7e6f5a8c3b1d0e9f8a7b6c5d4e3f21')).toBe('1f0c9a4');
    expect(shortSha('abc1234')).toBe('abc1234');
  });
});
