// ownerPathsModel.ts — "what can I do about it", beside "why not".
//
// A blocked merge box lists one line per blocker: what is happening and where
// to act. For a reader who administers the repository that was still only half
// the answer — "Blocked: 3 things need doing" says nothing about which of the
// three are theirs, and an owner who had already decided the question found no
// route at all. The server answers the other half (`owner-paths`); this turns
// it into the panel.
//
// Two rules, both the server's and kept here:
//
//   * nothing is hidden. Every blocker the server returned gets a row, in the
//     server's order, whether or not the reader can clear it;
//   * the clearable ones come with the step that clears them, and are marked
//     as the reader's to do. Nothing is reordered: the gate's own order is how
//     the merge box reads it too.

import type { OwnerBlockerPath, OwnerMergePaths } from '../../api/types';

/** One row of the owner panel. */
export interface OwnerPathRow {
  /** The passport blocker's code, so the row lines up with the gate line. */
  code: string;
  /** The blocker, in the passport's own words. */
  message: string;
  /** The step that clears it, in one sentence. */
  how: string;
  /** Whether a repository admin clears this one. */
  owner: boolean;
}

/** The panel's rows, or an empty list when there is nothing to explain. */
export function ownerPathRows(
  paths: OwnerMergePaths | null | undefined
): OwnerPathRow[] {
  if (!paths || !paths.blocked) return [];
  return paths.blockers.map((blocker: OwnerBlockerPath) => ({
    code: blocker.code,
    message: blocker.message,
    how: blocker.how,
    owner: blocker.owner_can_clear,
  }));
}

/**
 * The sentence above the rows. The server writes it, because it is the one
 * that counts the blockers; an answer that arrived without one still gets a
 * heading rather than a bare list.
 */
export function ownerPathHeadline(
  paths: OwnerMergePaths | null | undefined
): string | null {
  if (!paths || !paths.blocked) return null;
  const headline = paths.headline?.trim();
  if (headline) return headline;
  const clearable = paths.blockers.filter((row) => row.owner_can_clear).length;
  return clearable > 0
    ? `${clearable} of ${paths.blockers.length} blockers clear from here.`
    : 'None of these blockers clears from this page.';
}

/**
 * Whether to show the panel at all. A blocked head with no step anybody can
 * take is exactly the case the panel exists for — it says so in one line —
 * so the only reason to leave it out is a head that is not blocked, or a
 * server that answered with no blockers.
 */
export function showOwnerPaths(
  paths: OwnerMergePaths | null | undefined
): boolean {
  return Boolean(paths?.blocked) && (paths?.blockers.length ?? 0) > 0;
}

/**
 * The one extra sentence an administrator gets: branch protection here leaves
 * administrators out, so the steps below are theirs to take. Null for everyone
 * else — telling a reader about a standing they do not have is noise.
 */
export function ownerStandingNote(
  paths: OwnerMergePaths | null | undefined
): string | null {
  if (!paths?.blocked) return null;
  // All three fields have to agree before the sentence below is a fact. The
  // server masks `enforce_admins` for a reader who does not administer the
  // repository, so a null there means "not told", never "off": an answer that
  // claims the standing without the protection state behind it gets no note.
  if (
    !paths.viewer_may_clear_as_owner ||
    !paths.viewer_is_admin ||
    paths.enforce_admins !== false
  ) {
    return null;
  }
  return `Branch protection on ${paths.base_ref} leaves administrators out (enforce_admins is off), and you administer this repository: the steps marked below are yours to take on head ${paths.head_sha.slice(0, 12)}.`;
}
