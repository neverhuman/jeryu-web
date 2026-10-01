// fleet/RunnerReleaseLink.tsx — the small secondary line under a runner's name
// that says where its code is released: "acme · Gate runner · installed
// v1.2.0", linked to that lane of the family's release board.

import { Link } from 'react-router-dom';

import { runnerReleaseHref, runnerReleaseText, type RunnerRelease } from './releaseIndex';

export function RunnerReleaseLink({
  release,
  codeVersion,
  testId,
}: {
  release: RunnerRelease;
  codeVersion?: string | null;
  testId: string;
}): JSX.Element {
  return (
    <p className="fleet__node-release">
      <Link
        to={runnerReleaseHref(release)}
        data-testid={testId}
        title={`On the ${release.family} release board, lane ${release.laneName}`}
      >
        {runnerReleaseText(release, codeVersion)}
      </Link>
    </p>
  );
}
