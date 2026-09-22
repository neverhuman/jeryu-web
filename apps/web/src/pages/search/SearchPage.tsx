// SearchPage.tsx — /search?q=: a search that can be linked, pasted into a
// todo or handed to an agent. The query lives in the URL; repositories come
// from the server (`GET /api/v1/repos?q=`), pages and `name#12` pull requests
// are matched here the same way the command palette matches them.

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';

import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useRepositories } from '../../hooks/useRepositories';
import { pullTargets, repoFrontPage } from '../../layout/paletteModel';
import { useCommandStore } from '../../stores/commandStore';
import { pageHits } from './searchModel';

import '../page.css';

const NO_REPOS: never[] = [];

export function SearchPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);

  const commands = useCommandStore((s) => s.commands);
  const pages = useMemo(() => pageHits(query, commands), [query, commands]);

  const repos = useRepositories({ search: query, sort: 'name' }, { enabled: query !== '' });
  const rows = repos.data?.repositories ?? NO_REPOS;
  // `name#12` names a repository the server search would not match as typed.
  const allRepos = useRepositories({ sort: 'name' }, { enabled: query.includes('#') });
  const pulls = useMemo(
    () => pullTargets(query, allRepos.data?.repositories ?? NO_REPOS),
    [query, allRepos.data]
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
          Repositories, pages and pull requests (<code>name#12</code>). The address of this page
          is the search: copy it to share the results.
        </p>
      </header>
      <form role="search" onSubmit={submit}>
        <input
          type="search"
          aria-label="Search query"
          placeholder="A repository, a page, or name#12"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />{' '}
        <button type="submit">Search</button>
      </form>

      {query === '' ? (
        <EmptyState icon={Search} title="Type something to search for" />
      ) : (
        <>
          {pulls.length > 0 ? (
            <section aria-label="Pull requests">
              <h2 className="page__section-title">Pull requests</h2>
              <ul>
                {pulls.map((t) => (
                  <li key={t.id}>
                    <Link to={t.path}>{t.label}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-label="Repositories">
            <h2 className="page__section-title">Repositories</h2>
            {repos.isLoading ? (
              <LoadingState rows={3} />
            ) : repos.isError ? (
              <ErrorState title="Repository search failed." error={repos.error} />
            ) : rows.length === 0 ? (
              <p>No repository matches “{query}”.</p>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={`${r.id.host}:${r.id.owner}/${r.id.name}`}>
                    <Link to={repoFrontPage(r)}>
                      {r.id.owner}/{r.id.name}
                    </Link>
                    {r.description ? <span> — {r.description}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
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
