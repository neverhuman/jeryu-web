import type { ExternalPlanTask, ExternalWorkSnapshot } from '../../api/types';

const parent: ExternalPlanTask = {
  todo_id: 'acme-api-01', task_id: 'API-01', title: 'Contract freeze', phase_id: 'W0', phase_source: 'index', parent_id: null,
  milestone_ids: ['M0'], priority_rank: 1, critical_path: true, state: 'needs_human', reason: 'Owner must approve contract freeze',
  dependencies: [], pending_dependencies: [], merged: false, observed_efforts: 1, source_url: 'https://example.test/receipt', pull_requests: [],
};

export const EXTERNAL_WORK: ExternalWorkSnapshot = {
  schema_version: 1, family: 'acme', source_repo: 'root/Acme', provider: 'GitHub', source_url: 'https://github.com/example/Acme', default_branch: 'main',
  observed_at: '2026-10-30T12:00:00Z', task_observed_at: '2026-10-30T11:00:00Z', branch_observed_at: '2026-10-30T12:00:00Z',
  phases: [{ id: 'W0', label: 'W0 · Foundations', description: 'Contract and custody' }, { id: 'W1', label: 'W1 · Engine core', description: 'Discovery' }],
  milestones: [{ id: 'M0', label: 'Contracts frozen', task_ids: ['acme-api-01', 'acme-api-01-f01'] }],
  tasks: [parent,
    { ...parent, todo_id: 'acme-api-01-f01', task_id: 'API-01-F01', title: 'Expose validated modules', parent_id: 'acme-api-01', state: 'merged', merged: true, critical_path: false, reason: 'Implementation merged' },
    { ...parent, todo_id: 'acme-svc-01', task_id: 'SVC-01', title: 'Durable store', phase_id: 'W1', priority_rank: 30, state: 'waiting_dependency',
      critical_path: false, reason: 'Waiting for API-01', dependencies: ['acme-api-01'], pending_dependencies: ['acme-api-01'] },
  ],
  branches: [
    { name: 'v1/api-01', head_sha: 'a'.repeat(40), ahead_by: 2, behind_by: 1, comparison: 'diverged', state: 'review', task_id: 'acme-api-01',
      url: 'https://github.com/example/Acme/tree/v1%2Fapi-01', pull_request: { number: 12, title: 'Contract', state: 'OPEN', url: 'https://github.com/example/Acme/pull/12' } },
    { name: 'v1/merged', head_sha: 'b'.repeat(40), ahead_by: 40, behind_by: 20, comparison: 'diverged', state: 'merged', task_id: 'acme-api-01-f01',
      url: 'https://github.com/example/Acme/tree/v1%2Fmerged', pull_request: { number: 10, title: 'Modules', state: 'MERGED', url: 'https://github.com/example/Acme/pull/10' } },
  ], problems: [],
};
