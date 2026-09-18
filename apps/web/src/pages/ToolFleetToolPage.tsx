// ToolFleetToolPage.tsx — one jankurai tool's adoption, at `/shared-tools/adoption/:tool`.
//
// Reads the same `GET /fleet/tool-adoption` payload as the table and lists the
// adopting and should-adopt repos, each linking to the repo. The tool lanes are
// defined in the jankurai repo, which is linked as the tool's definition.

import { ArrowLeft, BookOpen, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState } from '../components/state';
import { useToolFleet } from '../hooks/useToolFleet';
import { adoptionPillClass } from './ToolFleetPage';
import { TOOL_DEFINITION_REPO, repoHref, toolRow } from './toolFleetModel';
import { ADOPTION_PATH } from './sharedTools/SharedToolsTabs';
import './page.css';
import './ToolFleetPage.css';

function RepoList({ repos, testId }: { repos: string[]; testId: string }): JSX.Element {
  if (repos.length === 0) return <p className="tool-fleet__none">—</p>;
  return (
    <ul className="tool-fleet__repos" data-testid={testId}>
      {repos.map((repo) => (
        <li key={repo}>
          <Link to={repoHref(repo)}>{repo}</Link>
        </li>
      ))}
    </ul>
  );
}

export function ToolFleetToolPage(): JSX.Element {
  const { tool = '' } = useParams();
  const { data, isPending, isError, error } = useToolFleet();
  const entry = data?.tools.find((candidate) => candidate.tool === tool);
  const definition = `${TOOL_DEFINITION_REPO.owner}/${TOOL_DEFINITION_REPO.name}`;

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
              <Link to={repoHref(definition)} data-testid="tool-fleet-definition">
                <BookOpen size={14} aria-hidden="true" /> Defined in {definition}
              </Link>
            </p>
          </header>
          <section className="page__section">
            <h2 className="page__section-title">
              Adopting ({entry.adopting_repos.length})
            </h2>
            <RepoList repos={entry.adopting_repos} testId="tool-fleet-adopting" />
          </section>
          <section className="page__section">
            <h2 className="page__section-title">
              Should adopt ({entry.applicable_missing_repos.length})
            </h2>
            <RepoList repos={entry.applicable_missing_repos} testId="tool-fleet-missing" />
          </section>
        </>
      )}
    </div>
  );
}
