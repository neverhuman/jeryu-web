import { describe, expect, it } from 'vitest';

import { protectionFacts, protectionHeadline } from '../branchProtectionModel';

describe('branchProtectionModel', () => {
  it('says what the live jeryu-web rule says, the rules that are on first', () => {
    const facts = protectionFacts({
      allow_deletions: { enabled: false },
      allow_force_pushes: { enabled: false },
      enforce_admins: { enabled: true },
      required_jankurai_proof: { enabled: false },
      required_linear_history: { enabled: true },
      required_pull_request_reviews: { required_approving_review_count: 1 },
      required_status_checks: { contexts: ['jeryu-web/required'], strict: true },
    });
    expect(facts[0]).toEqual({
      id: 'checks',
      state: 'on',
      text: 'A pull request merges only when jeryu-web/required is green on a head that is up to date with the branch.',
    });
    expect(facts.filter((f) => f.state === 'on').map((f) => f.id)).toEqual([
      'checks',
      'reviews',
      'linear',
      'admins',
      'force',
      'delete',
    ]);
    expect(facts.at(-1)).toMatchObject({ id: 'jankurai', state: 'off' });
    expect(facts.find((f) => f.id === 'reviews')?.text).toBe('1 approving review required.');
  });

  it('never throws on an empty or partial rule and reads it as unprotected facts', () => {
    const facts = protectionFacts({});
    expect(facts.find((f) => f.id === 'checks')).toMatchObject({ state: 'off' });
    expect(facts.find((f) => f.id === 'reviews')).toMatchObject({ state: 'off' });
    expect(facts.find((f) => f.id === 'force')).toMatchObject({ state: 'on' });
    expect(protectionFacts({ required_status_checks: null }).length).toBe(7);
  });

  it('has a one-line headline for a protected and an unprotected branch', () => {
    expect(protectionHeadline('main', null)).toBe(
      'main is not protected: anyone with write access can push to it.'
    );
    expect(protectionHeadline('main', { enforce_admins: { enabled: true } })).toBe(
      'main is protected by 3 rules.'
    );
  });
});
