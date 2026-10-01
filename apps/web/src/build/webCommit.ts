// The commit this web bundle was built from. `vite.config.ts` resolves it once
// at build time (JERYU_WEB_COMMIT, else `git rev-parse HEAD`) and defines
// `__JERYU_WEB_COMMIT__`; the page reads it back to say which UI it is, so an
// operator can tell a served bundle from the one the forge pins.
//
// The value is a pure function of the checkout's commit, so a pinned build
// stays reproducible. A build without git and without the variable embeds null.

const COMMIT = /^[0-9a-f]{7,40}$/;

/** A commit sha, lower-cased, or null when `value` is not one. */
export function normalizeCommit(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  return COMMIT.test(trimmed) ? trimmed : null;
}

/**
 * The build's commit: `JERYU_WEB_COMMIT` when set, else what `gitHead` reports.
 * `gitHead` throws when git is missing or this is not a checkout; that is null.
 */
export function resolveWebCommit(
  envCommit: string | undefined,
  gitHead: () => string
): string | null {
  if (envCommit !== undefined && envCommit.trim() !== '') {
    return normalizeCommit(envCommit);
  }
  try {
    return normalizeCommit(gitHead());
  } catch {
    return null;
  }
}

/** The commit this page was built from; null when the build did not know it. */
export function pageWebCommit(): string | null {
  // `typeof` keeps an environment without the define (vitest) from throwing.
  return typeof __JERYU_WEB_COMMIT__ === 'string'
    ? normalizeCommit(__JERYU_WEB_COMMIT__)
    : null;
}
