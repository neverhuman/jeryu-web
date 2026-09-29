// SearchPage.tsx — /search?q=: a search that can be linked, pasted into a
// todo or handed to an agent. The query lives in the URL; the records come
// from one server call (`GET /api/v1/search`), which looks in repositories,
// pull requests, issues, todos and — for admins — the activity log. Pages are
// matched here, because only the SPA knows its own nav destinations.

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useSearch } from '../../hooks/useSearch';
import { useCommandStore } from '../../stores/commandStore';
import { hiddenCount, hitGroups, pageHits, type HitGroup } from './searchModel';

import '../page.css';

const NO_HITS: never[] = [];

export function SearchPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);

  const commands = useCommandStore((s) => s.commands);
  const pages = useMemo(() => pageHits(query, commands), [query, commands]);

  const search = useSearch({ q: query });
  const answer = search.data;
  const groups = useMemo(
    () => (answer ? hitGroups(answer.kinds, answer.results, answer.counts) : NO_HITS),
    [answer]
  );

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const q = draft.trim();
    setParams(q ? { q } : {});
  };

  return (
    <div className="page" data-testid="search-page">
      <header className="page__header">
        <h1 className="page__title">Search</h1>
        <p className="page__subtitle">
          Repositories, pull requests, issues and todos, plus this app&apos;s own pages. A
          number (<code>name#12</code>) finds the pull request it names. The address of this
          page is the search: copy it to share the results.
        </p>
      </header>
      <form role="search" onSubmit={submit}>
        <input
          type="search"
          aria-label="Search query"
          placeholder="A repository, a pull request, a todo, or name#12"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />{' '}
        <button type="submit">Search</button>
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
