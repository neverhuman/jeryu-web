// RepositoryAutomationPage.tsx — `/repos/:p/:o/:n/automation`.
//
// What runs on the repository, who reviews and merges it, what last deployed
// it, who holds which grant, and where it is mirrored to. This was appended
// under the README on the front page, where a reader opening a file scrolled
// past it; it is its own tab now, and the tab is marked when one of its
// warnings needs a person.

import { RepoAutomationPanel } from '../components/repo/RepoAutomationPanel';
import { useResolveRepo } from '../hooks/useResolveRepo';

import './page.css';

export interface RepositoryAutomationPageProps {
  provider: string;
  fullName: string;
}

export function RepositoryAutomationPage({
  provider,
  fullName,
}: RepositoryAutomationPageProps): JSX.Element {
  const resolved = useResolveRepo(provider, fullName);
  return (
    <div className="page page--wide" data-testid="repo-automation-page">
      <RepoAutomationPanel repoId={resolved.data?.id ?? null} />
    </div>
  );
}
