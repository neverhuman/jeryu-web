import type { BuildInventory, CandidateBuild, LineageGraph } from '../../../api/types/delivery';
const sha = (letter: string) => letter.repeat(40);
export const LINEAGE: LineageGraph = {
  repository: 'acme/widget-api', default_branch: 'main', default_sha: sha('b'), observed_at: '2026-10-30T12:00:00Z', truncated: false, missing_parents: [sha('0')], shallow: false,
  branches: [{ name: 'feature/search', sha: sha('d'), updated_at: '2026-10-30T12:00:00Z', pull_number: 42, pull_title: 'Search by customer', draft: false, base_ref: 'main', relation: 'diverged' }],
  commits: [
    { sha: sha('d'), parents: [sha('c'), sha('b')], summary: 'Merge main into search', author: 'Ada', committed_at: '2026-10-30T12:00:00Z' },
    { sha: sha('c'), parents: [sha('a')], summary: 'Search by customer', author: 'Ada', committed_at: '2026-10-30T11:00:00Z' },
    { sha: sha('b'), parents: [sha('a')], summary: 'Fix customer import', author: 'Lin', committed_at: '2026-10-30T10:00:00Z' },
    { sha: sha('a'), parents: [sha('0')], summary: 'Shared base', author: 'Lin', committed_at: '2026-10-29T10:00:00Z' },
  ],
};
function build(id: string, day: number, status: CandidateBuild['status'] = 'built'): CandidateBuild {
  return { id, deliverable: 'Cloud app', built_at: `2026-10-${day}T10:00:00Z`, observed_at: '2026-10-30T12:00:00Z', source_repo: 'acme/widget-api', source_sha: sha(day % 2 ? 'b' : 'd'), status, artifacts: status === 'failed' ? [] : [{ repository: 'image.example/acme/cloud-app', digest: `sha256:${String(day).padStart(64, '0')}`, tags: [id, ...(id === 'rc-18' ? ['production'] : [])] }], log_url: 'https://build.example/runs/42' };
}
export const INVENTORY: BuildInventory = {
  family: 'acme', deliverable: 'Cloud app', deliverables: ['Cloud app'], total: 6, next_offset: null, placements_observed_at: '2026-10-30T12:00:00Z',
  builds: [build('rc-21', 30), build('rc-20', 29, 'failed'), build('rc-19', 28), build('rc-18', 27), build('rc-17', 26), build('rc-16', 25)],
  placements: [
    { deliverable: 'Cloud app', environment: 'dev', target: 'dev-01', current: 'rc-21', previous: 'rc-19', production: false },
    { deliverable: 'Cloud app', environment: 'production', target: 'app-01', current: 'rc-18', previous: 'rc-17', production: true },
    { deliverable: 'Cloud app', environment: 'staging', target: 'stage-01', current: 'rc-18', previous: 'rc-17', production: false },
  ],
};
