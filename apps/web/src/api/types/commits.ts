// commits.ts — `GET /api/v1/repos/{id}/commits?ref=&path=&limit=&page=`: a
// branch's commit history, newest first, and
// `GET /api/v1/repos/{id}/commit/{sha}`: one of those commits in full. The
// commit shape of the list is the one `/compare` uses.

import type { CompareCommit } from './deployments';
import type { PullRequestDiffFile } from './pullRequests';

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

/**
 * `GET /api/v1/repos/{id}/commit/{sha}`: one commit. `files` is the diff shape
 * the pull request cockpit renders, so the same viewer shows it. A merge commit
 * is diffed against its first parent.
 */
export interface RepoCommitDetail {
  sha: string;
  /** The first line of the message. */
  summary: string;
  /** The whole message, subject line and body. */
  message: string;
  author: string;
  author_email: string;
  authored_at: string;
  committed_at: string;
  parents: string[];
  files: PullRequestDiffFile[];
  /** True when the server dropped hunk bodies past its line budget. */
  truncated: boolean;
}
