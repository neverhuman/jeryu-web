import { describe, expect, it } from 'vitest';

import {
  behindPinLines,
  pinLabel,
  pinNextStep,
  pinStateOf,
  pinTone,
  scopeConsumers,
  shortRepo,
  splitPins,
} from '../pinsModel';
import { PINS, pin } from './pipelineTestData';

describe('pinsModel', () => {
  it('says where a pin stands in one plain sentence', () => {
    expect(pinLabel(pin({ dependency: 'jeryu/jeryu-web', behind: 9, state: 'behind' }))).toBe(
      '9 merged commits not pinned yet'
    );
    expect(pinLabel(pin({ dependency: 'jeryu/jeryu-web', behind: 1, state: 'behind' }))).toBe(
      '1 merged commit not pinned yet'
    );
    expect(
      pinLabel(pin({ dependency: 'jeryu/jeryu-web', behind: 2, state: 'behind_not_green' }))
    ).toBe('2 merged commits waiting for a green gate');
    expect(pinLabel(pin({ dependency: 'jeryu/jeryu-web', state: 'diverged' }))).toBe('diverged from main');
    expect(
      pinLabel(
        pin({ dependency: 'jeryu/jeryu-core', kind: 'tag', pinned_ref: 'core-v6', behind: 3, state: 'behind' })
      )
    ).toBe('3 commits since tag core-v6, needs a new tag');
    expect(pinLabel(pin({ dependency: 'jeryu/jeryu-web' }))).toBe('current');
  });

  it('treats a state it does not know as unknown, never as current', () => {
    const odd = pin({ dependency: 'jeryu/jeryu-web', state: 'superseded' });
    expect(pinStateOf(odd)).toBe('unknown');
    expect(pinLabel(odd)).toBe('could not be compared with main');
    expect(splitPins({ repo: 'a/b', family: null, branch: 'main', pins: [odd] }).open).toHaveLength(1);
  });

  it('is red only where something is wrong: a trailing tag is a standing fact, not an alarm', () => {
    expect(pinTone(pin({ dependency: 'a/web', behind: 9, state: 'behind' }))).toBe('neutral');
    expect(pinTone(pin({ dependency: 'a/web', behind: 9, state: 'behind_not_green' }))).toBe('neutral');
    expect(pinTone(pin({ dependency: 'a/core', kind: 'tag', behind: 3, state: 'behind' }))).toBe('neutral');
    expect(pinTone(pin({ dependency: 'a/web', state: 'diverged' }))).toBe('danger');
  });

  it('names exactly one next step, the bump PR when one is open', () => {
    expect(pinNextStep(pin({ dependency: 'a/web', behind: 9, state: 'behind' }))).toEqual({
      text: 'the pin bump opens by itself within minutes',
      to: null,
    });
    expect(
      pinNextStep(
        pin({
          dependency: 'a/web',
          behind: 9,
          state: 'behind',
          bump_pr: { number: 53, state: 'open', url: '/repos/jeryu/jeryu/jeryu-deploy/pulls/53' },
        })
      )
    ).toEqual({ text: 'bump PR #53 is open', to: '/repos/jeryu/jeryu/jeryu-deploy/pulls/53' });
    // An off-site or protocol-relative URL is text, not a link.
    expect(
      pinNextStep(
        pin({ dependency: 'a/web', state: 'behind', bump_pr: { number: 5, state: 'open', url: '//evil.example/x' } })
      ).to
    ).toBeNull();
    expect(pinNextStep(pin({ dependency: 'a/core', kind: 'tag', behind: 3, state: 'behind' })).text).toBe(
      'cut a tag on main, then bump the manifest'
    );
    expect(pinNextStep(pin({ dependency: 'a/web', behind: 2, state: 'behind_not_green' })).text).toBe(
      'the pin bump opens once main is green'
    );
  });

  it('splits a consumer into pins to look at and a count of current ones', () => {
    const split = splitPins(PINS.consumers[0]);
    expect(split.open.map((p) => p.dependency)).toEqual(['jeryu/jeryu-core', 'jeryu/jeryu-web']);
    expect(split.currentCount).toBe(2);
    expect(splitPins({ repo: 'a/b', family: null, branch: 'main', pins: [] })).toMatchObject({
      open: [],
      currentCount: 0,
    });
  });

  it('scopes consumers to the repo, to a dependency of it, or to the family', () => {
    const all = PINS.consumers;
    const names = (scope: Parameters<typeof scopeConsumers>[1]) =>
      scopeConsumers(all, scope).map((c) => c.repo);
    expect(names({ repo: 'jeryu/jeryu-deploy', family: null, familyRepos: [] })).toEqual(['jeryu/jeryu-deploy']);
    expect(names({ repo: 'jeryu/jeryu-web', family: null, familyRepos: [] })).toEqual(['jeryu/jeryu-deploy']);
    expect(names({ repo: null, family: 'jain', familyRepos: [] })).toEqual(['veox/jain-deploy']);
    expect(names({ repo: null, family: 'x', familyRepos: ['jeryu/jeryu-deploy'] })).toEqual(['jeryu/jeryu-deploy']);
    expect(names({ repo: 'other/repo', family: null, familyRepos: [] })).toEqual([]);
  });

  it('gives Releases one line per commit pin that is behind, and none for tags', () => {
    expect(behindPinLines(PINS.consumers, 'jeryu/jeryu-deploy')).toEqual([
      "jeryu-web has 9 merged commits not in this repo's pin",
    ]);
    expect(behindPinLines(PINS.consumers, 'veox/jain-deploy')).toEqual([]);
    expect(behindPinLines(PINS.consumers, 'not/there')).toEqual([]);
    expect(shortRepo('jeryu-web')).toBe('jeryu-web');
  });
});
