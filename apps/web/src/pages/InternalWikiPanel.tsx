// InternalWikiPanel.tsx — Settings: which repository is the instance's wiki.
//
// Choosing one adds a Wiki link to the left navigation for everyone who can
// read that repository, and opens it at `/wiki` as documents instead of code.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet, apiPut } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { AdminSiteSettings } from '../api/types/wiki';
import { ActionButton } from '../components/action/ActionButton';
import { ErrorState, LoadingState } from '../components/state';
import { useRepositories } from '../hooks/useRepositories';
import { SITE_SETTINGS_KEY } from '../hooks/useSiteSettings';
import { WIKI_PATH } from './wiki/wikiModel';
import { dateText } from '../format/when';

const ADMIN_SITE_SETTINGS_KEY: readonly string[] = ['admin', 'site-settings'];

export function InternalWikiPanel(): JSX.Element {
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ADMIN_SITE_SETTINGS_KEY,
    queryFn: ({ signal }) => apiGet<AdminSiteSettings>(endpoints.adminSiteSettings(), { signal }),
  });
  const repos = useRepositories({ sort: 'name' });
  // `null` until the admin changes the selection; until then show what is saved.
  const [choice, setChoice] = useState<string | null>(null);
  const saved = current.data?.internal_wiki?.full_name ?? '';
  const selected = choice ?? saved;
  const save = useMutation({
    mutationFn: (fullName: string) =>
      apiPut<AdminSiteSettings>(endpoints.adminSiteSettings(), {
        internal_wiki: fullName === '' ? null : fullName,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(ADMIN_SITE_SETTINGS_KEY, next);
      setChoice(null);
      return queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
    },
  });
  const options = (repos.data?.repositories ?? [])
    .map((repo) => ({
      value: `${repo.id.owner}/${repo.id.name}`,
      visibility: repo.visibility,
    }))
    .sort((a, b) => a.value.localeCompare(b.value));

  return (
    <section className="page__section" aria-labelledby="internal-wiki-title" id="internal-wiki">
      <h2 className="page__section-title" id="internal-wiki-title">
        Internal wiki
      </h2>
      <p className="page__subtitle">
        A repository of Markdown pages shown as the instance&apos;s wiki. Everyone who can read it
        gets a Wiki link in the navigation.
      </p>
      {current.isPending || repos.isPending ? (
        <LoadingState title="Loading wiki settings..." variant="message" />
      ) : current.error ? (
        <ErrorState title="Could not load wiki settings" error={current.error} />
      ) : (
        <form
          className="page__card"
          aria-label="Internal wiki"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(selected);
          }}
        >
          <label className="admin-wiki__field">
            Wiki repository
            <select
              value={selected}
              onChange={(event) => setChoice(event.currentTarget.value)}
              data-testid="internal-wiki-select"
            >
              <option value="">No wiki</option>
              {saved !== '' && !options.some((option) => option.value === saved) ? (
                <option value={saved}>{saved}</option>
              ) : null}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} ({option.visibility})
                </option>
              ))}
            </select>
          </label>
          {current.data.internal_wiki_missing ? (
            <p className="page__roadmap-note" role="status">
              The repository chosen before no longer exists, so no wiki is shown. Choose another.
            </p>
          ) : null}
          <div className="page__inline-actions">
            <ActionButton
              type="submit"
              actionId="admin.set_internal_wiki"
              variant="primary"
              disabled={save.isPending || selected === saved}
            >
              Save
            </ActionButton>
            {current.data.internal_wiki ? (
              <Link to={WIKI_PATH}>Open the wiki</Link>
            ) : null}
            {current.data.updated_by && current.data.updated_at ? (
              <span className="page__pill">
                Set by {current.data.updated_by} on {dateText(current.data.updated_at)}
              </span>
            ) : null}
            {save.isSuccess && choice === null ? (
              <span className="page__pill page__pill--success">Saved</span>
            ) : null}
          </div>
          {repos.error ? (
            <ErrorState title="Could not list repositories" error={repos.error} />
          ) : null}
          {save.error ? <ErrorState title="Could not save the wiki" error={save.error} /> : null}
        </form>
      )}
    </section>
  );
}
