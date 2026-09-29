// commits.ts — `GET /api/v1/repos/{id}/commits?ref=&limit=&page=`: a branch's
// commit history, newest first. The commit shape is the one `/compare` uses.

import type { CompareCommit } from './deployments';

/** Paging of a commits page; `total` counts the whole history of `ref`. */
export interface CommitsPageInfo {
  limit: number;
  page: number;
  total: number;
  has_more: boolean;
}

export interface RepoCommitsResponse {
  ref: string;
  /** The commit `ref` resolved to. */
  sha: string;
  commits: CompareCommit[];
  page: CommitsPageInfo;
}
