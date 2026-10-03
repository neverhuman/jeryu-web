// RepositoryActivityPage.tsx — `/repos/:p/:o/:n/activity`.
//
// The pipeline event log filtered to this repository: the same feed as
// `/activity`, pinned to `repo=owner/name`, which the feed already filters on.

import { ActivityPage } from './activity/ActivityPage';

export interface RepositoryActivityPageProps {
  fullName: string;
}

export function RepositoryActivityPage({
  fullName,
}: RepositoryActivityPageProps): JSX.Element {
  return <ActivityPage repo={fullName} />;
}
