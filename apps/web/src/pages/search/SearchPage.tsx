// SearchPage.tsx — /search?q=: a search that can be linked, pasted into a
// todo or handed to an agent. The query lives in the URL; the records come
// from one server call (`GET /api/v1/search`), which looks in repositories,
// pull requests, issues, todos and — for admins — the activity log. Pages are
// matched here, because only the SPA knows its own nav destinations.
//
// The family scope is a facet over the answer: a hit naming a repository of
// another family is left out and counted, and the per-kind totals then come
// from the rows on screen rather than from the server's unfiltered counts.
// `GET /api/v1/search` takes no family yet, so the facet is applied here from
// the repo→family map the shell already has.

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

import { ActionButton } from '../../components/action/ActionButton';
import { PageHeader } from '../../components/pageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { OtherFamilies } from '../../components/family/OtherFamilies';
import { useRepoFamilyScope } from '../../components/family/useRepoFamilyScope';
import { useSearch } from '../../hooks/useSearch';
import { useCommandStore } from '../../stores/commandStore';
import { hiddenCount, hitGroups, hitRepo, pageHits, type HitGroup } from './searchModel';
import { usePageTitle } from '../../hooks/usePageTitle';

import '../page.css';

const NO_HITS: never[] = [];

export function SearchPage(): JSX.Element {
  usePageTitle('Search');
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);

  const commands = useCommandStore((s) => s.commands);
  const pages = useMemo(() => pageHits(query, commands), [query, commands]);

  const search = useSearch({ q: query });
  const answer = search.data;
  const scope = useRepoFamilyScope();
  const scoped = useMemo(
    () => scope.rowsByRepo(answer?.results ?? [], hitRepo),
    [answer, scope]
  );
  const groups = useMemo(
    () =>
      answer
        ? // Scoped, the server's per-kind totals are about every family: the
          // sections count what is on them instead of promising more.
          hitGroups(answer.kinds, scoped.rows, scope.active ? {} : answer.counts)
        : NO_HITS,
    [answer, scope.active, scoped.rows]
  );

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const q = draft.trim();
    setParams(q ? { q } : {});
  };

  return (
    <div className="page" data-testid="search-page">
      <PageHeader
        title="Search"
        testId="search-header"
        subtitle={
          <>
            Repositories, pull requests, issues and todos, plus this app&apos;s
            own pages. A number (<code>name#12</code>) finds the pull request it
            names. The address of this page is the search: copy it to share the
            results.
          </>
        }
      />
      <form role="search" className="search-page__form" onSubmit={submit}>
        <input
          type="search"
          className="form-input search-page__input"
          aria-label="Search query"
          placeholder="A repository, a pull request, a todo, or name#12"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <ActionButton type="submit" variant="primary">
          Search
        </ActionButton>
      </form>

      {query === '' ? (
        <EmptyState icon={Search} title="Type something to search for" />
      ) : search.isLoading ? (
        <LoadingState rows={5} />
      ) : search.isError ? (
        <ErrorState title="Search failed." error={search.error} />
      ) : (
        <>
          {answer?.problems.map((problem) => (
            <p key={problem} role="status">
              Could not search {problem}
            </p>
          ))}
          {scope.active ? (
            <p data-testid="search-family-facet">
              Showing matches in {scope.label}. Pages are the same for every
              family.
            </p>
          ) : null}
          <OtherFamilies count={scoped.elsewhere} noun="matches" />
          {groups.map((group) => (
            <Section key={group.kind} group={group} query={query} />
          ))}
          <section aria-label="Pages">
            <h2 className="page__section-title">Pages</h2>
            {pages.length === 0 ? (
              <p>No page matches “{query}”.</p>
            ) : (
              <ul>
                {pages.map((p) => (
                  <li key={p.id}>
                    <Link to={p.path}>{p.title}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Section({ group, query }: { group: HitGroup; query: string }): JSX.Element {
  const hidden = hiddenCount(group);
  return (
    <section aria-label={group.label}>
      <h2 className="page__section-title">{group.label}</h2>
      {group.hits.length === 0 ? (
        <p>
          No {group.label.toLowerCase().replace(/s$/, '')} matches “{query}”.
        </p>
      ) : (
        <>
          <ul>
            {group.hits.map((hit) => (
              <li key={hit.id}>
                <Link to={hit.path}>{hit.title}</Link>
                {hit.context ? <span> — {hit.context}</span> : null}
                {hit.snippet ? <p>{hit.snippet}</p> : null}
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p>
              {hidden} more {group.label.toLowerCase()} match “{query}”.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
