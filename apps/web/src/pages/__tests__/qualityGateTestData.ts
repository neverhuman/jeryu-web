// qualityGateTestData.ts — contract fixtures for the Quality gate pages.

import type {
  QualityGateHeadDetail,
  QualityGateOverview,
  QualityGateRuleDetail,
} from '../../api/types';

export const OVERVIEW: QualityGateOverview = {
  schema_version: 1,
  generated_at: '2026-09-19T16:00:00Z',
  window_days: 30,
  heads_scored: 40,
  heads_failed: 10,
  fail_rate: 0.25,
  disputes: 3,
  rules: [
    {
      rule: 'evidence-link',
      title: 'Every claim carries a link to its evidence',
      failures: 4,
      repos: 2,
      disputes: 3,
      dispute_rate: 0.75,
    },
    {
      rule: 'stale-naming',
      title: 'A name says what the thing is now',
      failures: 12,
      repos: 3,
      disputes: 0,
      dispute_rate: 0,
    },
    {
      rule: 'untested-path',
      title: 'A changed path has a test that covers it',
      failures: 0,
      repos: 0,
      disputes: 0,
      dispute_rate: 0,
    },
  ],
  repos: [
    {
      repo: 'jeryu/jeryu-web',
      heads_scored: 20,
      heads_failed: 8,
      fail_rate: 0.4,
      top_rule: 'stale-naming',
    },
    {
      repo: 'jeryu/jeryu-deploy',
      heads_scored: 20,
      heads_failed: 2,
      fail_rate: 0.1,
      top_rule: null,
    },
  ],
  daily: [
    { day: '2026-09-17', passed: 8, failed: 2 },
    { day: '2026-09-18', passed: 6, failed: 4 },
    { day: '2026-09-19', passed: 9, failed: 1 },
  ],
};

export const RULE: QualityGateRuleDetail = {
  schema_version: 1,
  rule: 'stale-naming',
  title: 'A name says what the thing is now',
  description: 'A name that no longer says what the thing is, is a finding.',
  window_days: 30,
  heads: [
    {
      repo: 'jeryu/jeryu-web',
      sha: '0863f25ab1c2d3e4f5061728394a5b6c7d8e9f01',
      branch: 'nightshift/2026-09-19',
      scored_at: '2026-09-19T12:00:00Z',
      score: 71,
      threshold: 85,
      findings: 3,
      disputes: 1,
    },
    {
      repo: 'jeryu/jeryu-deploy',
      sha: 'a985cb0ffeed1234567890abcdef1234567890ab',
      branch: 'main',
      scored_at: '2026-09-18T09:30:00Z',
      score: 88,
      threshold: 85,
      findings: 1,
      disputes: 0,
    },
  ],
};

export const HEAD: QualityGateHeadDetail = {
  schema_version: 1,
  repo: 'jeryu/jeryu-web',
  sha: '0863f25ab1c2d3e4f5061728394a5b6c7d8e9f01',
  branch: 'nightshift/2026-09-19',
  scored_at: '2026-09-19T12:00:00Z',
  score: 71,
  threshold: 85,
  passed: false,
  findings: [
    {
      id: 'f-1',
      rule: 'stale-naming',
      title: 'A name no longer says what the thing is',
      path: 'src/pages/ToolsPage.tsx',
      line: 42,
      evidence: 'const oldToolMap = buildToolMap();',
      disputed: false,
      dispute_reason: null,
      disputed_by: null,
      disputed_at: null,
    },
    {
      id: 'f-2',
      rule: 'evidence-link',
      title: 'A claim without a link to its evidence',
      path: 'docs/proof.md',
      line: 7,
      evidence: 'The gate runs on every push.',
      disputed: true,
      dispute_reason: 'The link is one line above.',
      disputed_by: 'alton',
      disputed_at: '2026-09-19T13:00:00Z',
    },
  ],
};
