// wiki.ts — wire shapes for the internal wiki: the site setting that names
// it, the Markdown page list and per-line blame (jeryu-api `site_settings.rs`,
// `repositories/pages.rs`, `repositories/blame.rs`).

/** The repository the instance uses as its wiki. */
export interface WikiRepository {
  /** Opaque id for `/api/v1/repos/{id}/...`. */
  id: string;
  host: string;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
}

/** `GET /api/v1/site-settings`: `internal_wiki` is null when unset or unreadable. */
export interface SiteSettings {
  internal_wiki: WikiRepository | null;
}

/** `GET`/`PUT /api/v1/admin/site-settings`. */
export interface AdminSiteSettings {
  internal_wiki: WikiRepository | null;
  /** A repository was chosen but no longer exists. */
  internal_wiki_missing: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

export interface MarkdownPage {
  path: string;
  size_bytes: number | null;
}

/** `GET /api/v1/repos/{id}/pages`. */
export interface PagesResponse {
  ref: string;
  sha: string;
  pages: MarkdownPage[];
  truncated: boolean;
}

export interface BlameCommit {
  sha: string;
  summary: string;
  author: string;
  authored_at: string;
  /** The root commit: the line has been there since history began. */
  boundary: boolean;
}

/** Consecutive lines (1-based) last changed by one commit. */
export interface BlameHunk {
  start_line: number;
  line_count: number;
  commit: string;
}

/** `GET /api/v1/repos/{id}/blame`. */
export interface BlameResponse {
  ref: string;
  sha: string;
  path: string;
  line_count: number;
  hunks: BlameHunk[];
  commits: BlameCommit[];
}
