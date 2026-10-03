// MergeBox.stories.tsx — where the merge stands, in one box (W-T-07).
//
// Covers the archetypes the plan calls out: ready to merge, held by two
// ordinary things, a drifted Passport, an approval requirement, and an agent
// evidence packet the Passport asks for.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';

import type { MergePassportBlocker, PullRequestChecks, PullRequestDetail } from '../../api/types';

import { MergeBox } from './MergeBox';

const meta: Meta<typeof MergeBox> = {
  title: 'merge/MergeBox',
  component: MergeBox,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MergeBox>;

const HEAD_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const HREFS = {
  threads: '#pr-threads',
  checks: '/checks',
  commits: '/commits',
};

function detail(over: {
  approvals?: number;
  passport?: 'pass' | 'blocked';
  blockers?: MergePassportBlocker[];
}): PullRequestDetail {
  const passport = over.passport ?? 'blocked';
  const canMerge = passport === 'pass';
  return {
    summary: {
      repo: { id: 'r1', host: 'acme', owner: 'acme', name: 'widget-api' },
      number: 32,
      entity: { kind: 'pull_request', id: 'r1#32' },
      title: 'Say why a login was refused',
      author: '@dana',
      head_ref: 'feature/login',
      base_ref: 'main',
      head_sha: HEAD_SHA,
      base_sha: 'base000000000000000000000000000000000000',
      state: 'open',
      draft: false,
      mergeable: {
        level: canMerge ? 'mergeable' : 'blocked',
        can_merge: canMerge,
        reason: canMerge ? null : 'the Passport has not cleared this head',
        exact_head_sha: HEAD_SHA,
        required_gate: canMerge ? null : 'passport',
      },
      review: {
        required_approvals: 1,
        approvals: over.approvals ?? 0,
        changes_requested: 0,
        unresolved_threads: 0,
        user_review_state: null,
      },
      checks: { total: 2, passing: 1, failing: 1, pending: 0, skipped: 0 },
      agents: {
        active_sessions: 0,
        proposed_patches: 0,
        evidence_packets: 0,
        blockers: 0,
      },
      labels: [],
      updated_at: '2026-05-26T12:00:00Z',
      passport_hash: 'hash-1',
      available_actions: [],
    },
    description: null,
    head_tree_sha: null,
    base_tree_sha: null,
    reviews: [],
    merge_passport: {
      status: passport,
      head_sha: HEAD_SHA,
      blockers: over.blockers ?? [],
      evaluated_at: '2026-05-26T12:00:00Z',
    },
    passport_hash: 'hash-1',
  };
}

function checks(failing: boolean): PullRequestChecks {
  return {
    total: 1,
    passing: failing ? 0 : 1,
    failing: failing ? 1 : 0,
    pending: 0,
    skipped: 0,
    checks: [
      {
        id: '1',
        name: 'acme/required',
        kind: 'status',
        status: failing ? 'failure' : 'success',
        conclusion: failing ? 'failure' : 'success',
        details_url: null,
        description: failing ? 'cargo test failed' : null,
        required: true,
        advisory: null,
        started_at: '2026-05-26T12:00:00Z',
        completed_at: '2026-05-26T12:01:00Z',
      },
    ],
  };
}

const COMMON = {
  hrefs: HREFS,
  viewer: { login: '@red-team', permissions: ['pr.write'] },
  viewerLogin: '@red-team',
  onApprove: () => undefined,
  onRequestChanges: () => undefined,
  onMerge: () => undefined,
  onSetState: () => undefined,
};

export const Ready: Story = {
  args: {
    ...COMMON,
    detail: detail({ passport: 'pass', approvals: 1 }),
    checks: checks(false),
  },
};

export const TwoThingsWaiting: Story = {
  name: 'Two things need doing',
  args: {
    ...COMMON,
    detail: detail({
      blockers: [
        { code: 'passport_blocked_approvals', message: 'Approvals not met.', details: null },
        { code: 'passport_blocked_checks', message: 'Required checks failing.', details: null },
      ],
    }),
    checks: checks(true),
  },
};

export const DriftedSha: Story = {
  name: 'Drifted SHA',
  args: {
    ...COMMON,
    detail: detail({
      approvals: 1,
      blockers: [
        {
          code: 'passport_blocked_passport_sha',
          message: 'Passport SHA drift.',
          details: 'Head moved to ab12cd34; refresh required.',
        },
      ],
    }),
    checks: checks(false),
  },
};

export const ApprovalRequired: Story = {
  name: 'Approval required',
  args: {
    ...COMMON,
    detail: detail({
      blockers: [
        {
          code: 'passport_blocked_codeowners',
          message: 'CODEOWNERS approval required.',
          details: '@acme/security owns src/login.rs',
        },
      ],
    }),
    checks: checks(false),
  },
};

export const AgentEvidence: Story = {
  name: 'Agent evidence required',
  args: {
    ...COMMON,
    detail: detail({
      approvals: 1,
      blockers: [
        {
          code: 'passport_blocked_agent_evidence',
          message: 'Agent evidence packet required.',
          details: 'Patches authored by `agent:rustfmt-bot` need a signed evidence pack.',
        },
      ],
    }),
    checks: checks(false),
  },
};
