// GithubMirrorSummary.tsx — read-only: whether this repository is mirrored to
// GitHub and how the last push went. Fed by the repository summary the Settings
// page already holds (`summary.mirror`); there is nothing to fetch.

import type { RepositoryMirrorStatus } from '../api/types';
import { When } from '../format/When';

import { MIRROR_OPERATOR_SENTENCE, mirrorFacts } from './repoStatusModel';

export interface GithubMirrorSummaryProps {
  mirror?: RepositoryMirrorStatus | null;
}

export function GithubMirrorSummary({
  mirror
}: GithubMirrorSummaryProps): JSX.Element {
  const facts = mirrorFacts(mirror);
  return (
    <section
      className="page__section"
      aria-labelledby="github-mirror"
      data-testid="github-mirror"
    >
      <h2 className="page__section-title" id="github-mirror">
        GitHub mirror
      </h2>
      <p>{facts.headline}</p>
      {facts.configured ? (
        <ul className="page__fact-list">
          <li
            className={`page__fact page__fact--${facts.failing ? 'off' : 'on'}`}
          >
            <span className="page__fact-mark" aria-hidden="true">
              {facts.failing ? '–' : '✓'}
            </span>
            <span>
              Last attempt:{' '}
              {facts.lastAttemptAt ? (
                <>
                  <When at={facts.lastAttemptAt} />
                  , {facts.lastAttempt}
                </>
              ) : (
                'none yet'
              )}
            </span>
          </li>
          <li
            className={`page__fact page__fact--${facts.lastSuccessAt ? 'on' : 'off'}`}
          >
            <span className="page__fact-mark" aria-hidden="true">
              {facts.lastSuccessAt ? '✓' : '–'}
            </span>
            <span>
              Last success:{' '}
              {facts.lastSuccessAt ? (
                <When at={facts.lastSuccessAt} />
              ) : (
                'never'
              )}
            </span>
          </li>
        </ul>
      ) : null}
      {facts.failing ? (
        <p className="page__mirror-todo">{MIRROR_OPERATOR_SENTENCE}</p>
      ) : null}
    </section>
  );
}
