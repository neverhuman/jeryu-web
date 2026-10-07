// VersionLine.tsx — the one place the running build names itself.
//
// Reading a deploy used to mean calling `/api/v1/version` by hand: no page
// said which build was answering, so an operator comparing what they saw with
// what was released had nothing to compare. It sits at the foot of the left
// navigation, where every page carries it, and says the API's version and the
// commits behind it; hovering gives the full shas.

import { useServerVersion } from '../hooks/useServerVersion';
import type { ServerVersion } from '../api/types/version';

/** A commit as it is read aloud: the first seven characters. */
function shortCommit(commit: string): string {
  return commit.length > 7 ? commit.slice(0, 7) : commit;
}

/**
 * The line to show, e.g. `jeryu 5.0.0 · web 2d4a869`. A build that did not
 * know its web commit says only the version rather than an empty `web`.
 */
export function versionLabel(version: ServerVersion): string {
  const parts = [`jeryu ${version.version}`];
  if (version.webCommit) parts.push(`web ${shortCommit(version.webCommit)}`);
  return parts.join(' · ');
}

/** The full identity, for the title: both commits when the build knew them. */
export function versionTitle(version: ServerVersion): string {
  const parts = [`${version.name} ${version.version}`];
  if (version.commit) parts.push(`api commit ${version.commit}`);
  if (version.webCommit) parts.push(`web commit ${version.webCommit}`);
  return parts.join('\n');
}

export function VersionLine(): JSX.Element | null {
  const version = useServerVersion();
  // Until the server answers there is nothing honest to show, and a server
  // without the route never will: either way the foot of the nav stays empty.
  if (!version.data) return null;

  return (
    <p className="left-nav__version" title={versionTitle(version.data)} data-testid="version-line">
      {versionLabel(version.data)}
    </p>
  );
}
