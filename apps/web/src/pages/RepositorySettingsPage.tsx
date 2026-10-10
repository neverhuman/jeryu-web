// RepositorySettingsPage.tsx — repository Settings: what the forge serves.
//
// Five sections behind `/settings/<section>`, every one a read of live state
// plus the actions the API does offer:
//   General           the repository facts from the repositories list.
//   Branch protection the rule on the default branch.
//   Mirror            the offsite push mirror from the automation endpoint.
//   Access            the grants, which only an administrator may read.
//   Danger zone       archive, remove from the registry, purge.
//
// This forge serves no per-repository settings API, so nothing here stages a
// change: the page says what is true and leaves changing it to the API.

import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertOctagon,
  Cog,
  GitBranch,
  Globe,
  KeyRound,
} from 'lucide-react';

import { ApiError } from '../api/client';
import { RepoArchiveSection } from '../components/repo/RepoArchiveSection';
import { RepoDangerZone } from '../components/repo/RepoDangerZone';
import { SettingsLayout, type SettingsNavItem } from '../components/settings';
import {
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useAuth } from '../hooks/useAuth';
import { useBootstrap } from '../hooks/useBootstrap';
import { useRealtime } from '../hooks/useRealtime';
import { useRepoAutomation } from '../hooks/useRepoAutomation';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { useSelectionStore } from '../stores/selectionStore';

import { BranchProtectionSummary } from './BranchProtectionSummary';
import { RepositoryMirrorSection } from './RepositoryMirrorSection';
import { canSeeRepoSettings } from './repoShellModel';
import { repoRefOf, repoUrl } from './repoBrowserModel';
import {
  normalizeSection,
  sectionTitleFor,
  type SettingsSectionId,
} from './repositorySettingsModel';
import {
  AccessSectionView,
  GeneralSectionView,
} from './repositorySettingsSections';

import './page.css';

const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Cog },
  { id: 'branch-protection', label: 'Branch protection', icon: GitBranch },
  { id: 'mirror', label: 'Mirror', icon: Globe },
  { id: 'access', label: 'Access', icon: KeyRound },
  { id: 'danger-zone', label: 'Danger zone', icon: AlertOctagon, danger: true },
];

function fullNameFromParams(params: Record<string, string | undefined>): string {
  return params.fullName ?? '';
}

export interface RepositorySettingsPageProps {
  provider?: string;
  fullName?: string;
  section?: string;
}

export function RepositorySettingsPage(
  props: RepositorySettingsPageProps = {}
): JSX.Element {
  const params = useParams();
  const provider = props.provider ?? params.provider ?? 'unknown';
  const fullName = props.fullName ?? fullNameFromParams(params);
  // RepoRouter parses the splat and hands the section in; reading only the
  // route param left every section link showing General.
  const activeSection: SettingsSectionId = normalizeSection(
    props.section ?? params.section
  );

  const resolved = useResolveRepo(provider, fullName);
  const repoId = resolved.data?.id ?? null;
  const setRepo = useSelectionStore((s) => s.setCurrentRepo);

  useEffect(() => {
    setRepo(repoId);
    return () => setRepo(null);
  }, [repoId, setRepo]);

  useRealtime(repoId ? [`repo.${repoId}`] : []);

  const automation = useRepoAutomation(repoId);
  const { user } = useAuth();
  const bootstrap = useBootstrap();
  const canWrite = canSeeRepoSettings(
    user?.role,
    bootstrap.data?.viewer.global_permissions ?? []
  );

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="repo-settings-page">
        <LoadingState
          title="Loading repository…"
          variant="message"
          description="Resolving the repository."
        />
      </div>
    );
  }

  if (resolved.error || !resolved.data) {
    if (resolved.error instanceof ApiError && resolved.error.status === 403) {
      return (
        <div className="page" data-testid="repo-settings-page">
          <PermissionDeniedState
            description="You do not have permission to view this repository."
            missingPermission="repo.read"
          />
        </div>
      );
    }
    return (
      <div className="page" data-testid="repo-settings-page">
        <ErrorState
          title="Repository not found"
          description={resolved.error?.message ?? `No repository ${fullName}.`}
        />
      </div>
    );
  }

  const summary = resolved.data.summary;
  const [owner = '', name = ''] = fullName.split('/');

  return (
    // Named like every other state of this page, so a test or a reader can say
    // "the settings page" whether it loaded, failed or was refused.
    <div className="page page--full" data-testid="repo-settings-page">
      <header className="page__header">
        <h2 className="page__title">Settings · {summary.id.name}</h2>
        <p className="page__subtitle">{sectionTitleFor(activeSection)}</p>
      </header>

      <SettingsLayout
        sections={SETTINGS_NAV}
        activeSection={activeSection}
        hrefFor={(id) => repoUrl(repoRefOf(provider, fullName), 'settings', id)}
        renderLink={({ section, href, children }) => (
          <Link
            to={href}
            replace
            aria-current={section.id === activeSection ? 'page' : undefined}
          >
            {children}
          </Link>
        )}
      >
        {activeSection === 'general' && (
          <GeneralSectionView repo={summary} canWrite={canWrite} />
        )}

        {activeSection === 'branch-protection' && (
          <BranchProtectionSummary
            owner={owner}
            repo={name}
            branch={summary.default_branch ?? 'main'}
          />
        )}

        {activeSection === 'mirror' && (
          <RepositoryMirrorSection
            mirrors={automation.data?.mirrors}
            loading={automation.isPending}
            failed={Boolean(automation.error)}
          />
        )}

        {activeSection === 'access' && (
          <AccessSectionView
            grants={automation.data?.grants}
            visible={automation.data?.grantsVisible ?? false}
            loading={automation.isPending}
            failed={Boolean(automation.error)}
          />
        )}

        {activeSection === 'danger-zone' && (
          <>
            <RepoArchiveSection repo={summary} />
            <RepoDangerZone repo={summary} />
          </>
        )}
      </SettingsLayout>
    </div>
  );
}
