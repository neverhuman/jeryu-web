// ToolFleetToolPage.tsx — one jankurai tool's adoption, at `/shared-tools/adoption/:tool`.
//
// Reads the same `GET /fleet/tool-adoption` payload as the table. The repos
// that should adopt the tool come first — they are the only part of the page
// anyone can act on — grouped by the family that owns them, each family with a
// button that files one todo per repo into that family's queue. The repos
// already adopting it follow, grouped the same way. Every repository named links
// to its page on the forge the repository list says it is on.

import { useMemo, useState } from 'react';
import { ArrowLeft, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { ActionButton } from '../components/action/ActionButton';
import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { formatFamilyName } from '../components/repo/familyRollup';
import { useAuth } from '../hooks/useAuth';
import { useForgeHost } from '../hooks/useForgeHost';
import { useFileShiftTodos, useShiftFamilies } from '../hooks/useShift';
import { useToolFleet } from '../hooks/useToolFleet';
import { adoptionPillClass } from './ToolFleetPage';
import {
  UNCLAIMED_FAMILY,
  adoptionTodoText,
  groupReposByFamily,
  type AdoptionFamilyGroup,
} from './toolAdoptionFamilies';
import { repoHref, toolRow } from './toolFleetModel';
import { ADOPTION_PATH } from './sharedTools/SharedToolsTabs';
import { usePageTitle } from '../hooks/usePageTitle';
import './page.css';
import './ToolFleetPage.css';

function RepoList({ repos }: { repos: string[] }): JSX.Element {
  // Which forge each repository is on comes from the repository list, not from
  // a constant: the adoption payload names repos as `owner/name` only.
  const forgeHost = useForgeHost();
  return (
    <ul className="tool-fleet__repos">
      {repos.map((repo) => (
        <li key={repo}>
          <Link to={repoHref(forgeHost(repo), repo)}>{repo}</Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * One family's repos, with the button that files their work when the caller
 * can file and the family has a queue to file into.
 */
function FamilyGroup({
  group,
  action,
}: {
  group: AdoptionFamilyGroup;
  action?: JSX.Element | null;
}): JSX.Element {
  return (
    <section
      className="tool-fleet__family"
      data-testid={`tool-fleet-family-${group.family}`}
      aria-label={formatFamilyName(group.family)}
    >
      <h3 className="tool-fleet__family-title">
        <span>
          {formatFamilyName(group.family)} ({group.repos.length})
        </span>
        {action}
      </h3>
      <RepoList repos={group.repos} />
    </section>
  );
}

function GroupedRepos({
  groups,
  testId,
  renderAction,
}: {
  groups: AdoptionFamilyGroup[];
  testId: string;
  renderAction?: (group: AdoptionFamilyGroup) => JSX.Element | null;
}): JSX.Element {
  if (groups.length === 0) return <p className="tool-fleet__none">—</p>;
  return (
    <div data-testid={testId}>
      {groups.map((group) => (
        <FamilyGroup
          key={group.family}
          group={group}
          action={renderAction ? renderAction(group) : null}
        />
      ))}
    </div>
  );
}

export function ToolFleetToolPage(): JSX.Element {
  const { tool = '' } = useParams();
  usePageTitle(tool ? `${tool} · Tool adoption` : 'Tool adoption');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data, isPending, isError, error } = useToolFleet();
  const families = useShiftFamilies();
  const file = useFileShiftTodos();
  // Which family is being filed right now, and which ones are done: filing is
  // one request per repo, so the button reports its own family only.
  const [filing, setFiling] = useState('');
  const [filed, setFiled] = useState<Record<string, number>>({});

  const entry = data?.tools.find((candidate) => candidate.tool === tool);
  const familyList = useMemo(() => families.data?.families ?? [], [families.data]);
  const missingGroups = useMemo(
    () => groupReposByFamily(entry?.applicable_missing_repos ?? [], familyList),
    [entry, familyList]
  );
  const adoptingGroups = useMemo(
    () => groupReposByFamily(entry?.adopting_repos ?? [], familyList),
    [entry, familyList]
  );

  // One todo per repo: the bulk endpoint shares one repo list across its texts,
  // and each of these todos is about exactly one repo.
  const fileForFamily = async (group: AdoptionFamilyGroup): Promise<void> => {
    setFiling(group.family);
    try {
      for (const [index, repo] of group.repos.entries()) {
        await file.mutateAsync({
          kind: 'single',
          family: group.family,
          text: adoptionTodoText(tool, repo),
          mode: 'night',
          repos: [group.queueNames[index] ?? repo],
        });
        setFiled((current) => ({ ...current, [group.family]: (current[group.family] ?? 0) + 1 }));
      }
    } finally {
      setFiling('');
    }
  };

  const missingAction = (group: AdoptionFamilyGroup): JSX.Element | null => {
    if (!isAdmin) return null;
    const done = filed[group.family] ?? 0;
    if (group.family === UNCLAIMED_FAMILY) {
      return <span className="tool-fleet__none">No queue files work for these repos.</span>;
    }
    if (done >= group.repos.length) {
      return (
        <span className="tool-fleet__none" role="status">
          Filed {done} todo{done === 1 ? '' : 's'}
        </span>
      );
    }
    return (
      <ActionButton
        variant="primary"
        disabled={filing !== ''}
        data-testid={`tool-fleet-file-${group.family}`}
        onClick={() => void fileForFamily(group)}
      >
        {filing === group.family
          ? `Filing ${done + 1}/${group.repos.length}…`
          : `File ${group.repos.length} todo${group.repos.length === 1 ? '' : 's'}`}
      </ActionButton>
    );
  };

  return (
    <div className="page page--wide" data-testid="tool-fleet-tool-page">
      <Link className="tool-fleet__back" to={ADOPTION_PATH}>
        <ArrowLeft size={14} aria-hidden="true" /> Adoption
      </Link>
      {isPending ? (
        <LoadingState title="Loading tool adoption…" variant="message" />
      ) : isError ? (
        <ErrorState title="Could not load tool adoption." error={error} />
      ) : !entry ? (
        <EmptyState icon={Wrench} title={`No adoption data for “${tool}”.`} />
      ) : (
        <>
          <header className="page__header">
            <h1 className="page__title">
              <Wrench size={20} aria-hidden="true" /> {entry.tool}
            </h1>
            <p className="page__subtitle tool-fleet__meta">
              <span className="page__pill">{entry.category}</span>
              <span className={adoptionPillClass(toolRow(entry))}>
                {toolRow(entry).adopted}/{toolRow(entry).total} adopted
              </span>
            </p>
          </header>
          <section className="page__section">
            <h2 className="page__section-title">
              Should adopt ({entry.applicable_missing_repos.length})
            </h2>
            <GroupedRepos
              groups={missingGroups}
              testId="tool-fleet-missing"
              renderAction={missingAction}
            />
            {file.error ? (
              <p className="tool-fleet__error" role="alert">
                {file.error.message}
              </p>
            ) : null}
          </section>
          <section className="page__section">
            <h2 className="page__section-title">
              Adopting ({entry.adopting_repos.length})
            </h2>
            <GroupedRepos groups={adoptingGroups} testId="tool-fleet-adopting" />
          </section>
        </>
      )}
    </div>
  );
}
