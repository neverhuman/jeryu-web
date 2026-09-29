// search.ts — hand-written wire types for `GET /api/v1/search`, the one
// endpoint that looks across the product's records. Contract:
// `jeryu-deploy/docs/search.md`.
//
// JSON is snake_case. Repository, pull request and issue hits are narrowed to
// what the reader may read; `activity` is searched for admins only, so
// `kinds` says which kinds this answer actually looked in.

export type SearchKind =
  | 'repository'
  | 'pull_request'
  | 'issue'
  | 'todo'
  | 'activity';

export interface SearchHit {
  kind: SearchKind;
  /** Stable within one answer; the list key. */
  id: string;
  title: string;
  /** One line saying where it lives: `owner/name`, a family, a state. */
  context: string;
  /** The matched line, when a body rather than a name matched. */
  snippet?: string;
  /** The page that opens it. */
  path: string;
  updated_at?: string;
  repo?: { id: string; host: string; owner: string; name: string };
}

export interface SearchResponse {
  generated_at: string;
  /** The query as the server matched it. */
  query: string;
  /** The kinds this answer searched, in display order. */
  kinds: SearchKind[];
  /** Matches per kind BEFORE `limit` cut the list. */
  counts: Partial<Record<SearchKind, number>>;
  /** Hits per kind this answer was cut to. */
  limit: number;
  results: SearchHit[];
  /** Sources that could not be read. Empty is the normal case. */
  problems: string[];
}

export interface SearchQuery {
  q: string;
  /** Kinds to search; omitted means every kind the reader may search. */
  kind?: SearchKind[];
  /** Hits per kind, 1–100. */
  limit?: number;
}
