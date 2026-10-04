// RepoAutomationPanel.tsx — the repository page's "Automation" and "Mirrors"
// sections: what runs on this repository, and where it is copied to.
//
// Reads one query (`GET /api/v1/repos/{id}/automation`). It is never the
// reason the page fails: a repository whose automation cannot be read says so
// in its own section and leaves the code, the README and the file tree alone.

import { AlertTriangle, ExternalLink } from 'lucide-react';

import type { RepoAutomation } from '../../api/types';
import { useRepoAutomation } from '../../hooks/useRepoAutomation';
import {
  actorKindText,
  actorTone,
  checkStatusText,
  checkTone,
  emptyAutomationText,
  grantText,
  hasAutomation,
  lastRunText,
  mirrorStatusText,
  mirrorTone,
  orderedActors,
  requiredText,
  shortSha,
  type AutomationTone,
} from '../../pages/repoAutomationModel';
import { When } from '../../format/When';

import './repoAutomation.css';

export interface RepoAutomationPanelProps {
  repoId: string | null;
}

function toneClass(tone: AutomationTone): string {
  return `repo-automation__row repo-automation__row--${tone}`;
}

export function RepoAutomationPanel({
  repoId,
}: RepoAutomationPanelProps): JSX.Element {
  const automation = useRepoAutomation(repoId);

  if (automation.isPending) {
    return (
      <section
        className="page__section"
        aria-labelledby="repo-automation"
        data-testid="repo-automation"
      >
        <h2 className="page__section-title" id="repo-automation">
          Automation
        </h2>
        <p className="repo-automation__note">Loading what runs here…</p>
      </section>
    );
  }
  if (automation.error || !automation.data) {
    return (
      <section
        className="page__section"
        aria-labelledby="repo-automation"
        data-testid="repo-automation"
      >
        <h2 className="page__section-title" id="repo-automation">
          Automation
        </h2>
        <p className="repo-automation__note">
          This forge did not answer what runs on the repository.
        </p>
      </section>
    );
  }

  const view: RepoAutomation = automation.data;
  return (
    <>
      <section
        className="page__section"
        aria-labelledby="repo-automation"
        data-testid="repo-automation"
      >
        <h2 className="page__section-title" id="repo-automation">
          Automation
        </h2>

        {view.warnings.length > 0 ? (
          <ul className="repo-automation__warnings" data-testid="repo-automation-warnings">
            {view.warnings.map((warning) => (
              <li key={warning} className="repo-automation__warning">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {hasAutomation(view) ? null : (
          <p className="repo-automation__note">{emptyAutomationText(view)}</p>
        )}

        {view.checks.length > 0 ? (
          <>
            <h3 className="repo-automation__subtitle">Checks</h3>
            <ul className="repo-automation__list" data-testid="repo-automation-checks">
              {view.checks.map((check) => (
                <li key={check.name} className={toneClass(checkTone(check))}>
                  <span className="repo-automation__name">{check.name}</span>
                  <span className="page__pill">{requiredText(check)}</span>
                  <span className="repo-automation__state">
                    {checkStatusText(check)}
                  </span>
                  {check.lastHeadSha ? (
                    <code className="repo-automation__sha">
                      {shortSha(check.lastHeadSha)}
                    </code>
                  ) : null}
                  <When at={check.lastRunAt} fallback="never" className="repo-automation__when" />
                  {check.detailsUrl ? (
                    <a
                      href={check.detailsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open the ${check.name} run`}
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {view.actors.length > 0 ? (
          <>
            <h3 className="repo-automation__subtitle">Acts on this repository</h3>
            <ul className="repo-automation__list" data-testid="repo-automation-actors">
              {orderedActors(view.actors).map((actor) => (
                <li
                  key={`${actor.kind}:${actor.identity}`}
                  className={toneClass(actorTone(actor))}
                >
                  <span className="page__pill">{actorKindText(actor.kind)}</span>
                  <span className="repo-automation__name">{actor.identity}</span>
                  <span className="repo-automation__state">{actor.role}</span>
                  {grantText(actor) ? (
                    <span
                      className="repo-automation__grant"
                      data-grant={actor.grant?.present ? 'present' : 'missing'}
                    >
                      {grantText(actor)}
                    </span>
                  ) : null}
                  {lastRunText(actor) ? (
                    <span className="repo-automation__state">
                      {lastRunText(actor)}
                    </span>
                  ) : null}
                  <When at={actor.lastRun?.at} fallback="never" className="repo-automation__when" />
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h3 className="repo-automation__subtitle">Grants</h3>
        {view.grantsVisible ? (
          view.grants.length > 0 ? (
            <ul className="repo-automation__list" data-testid="repo-automation-grants">
              {view.grants.map((grant) => (
                <li key={grant.login} className={toneClass('ok')}>
                  <span className="repo-automation__name">{grant.login}</span>
                  <span className="page__pill">{grant.access}</span>
                  <span className="repo-automation__state">
                    granted by {grant.grantedBy}
                  </span>
                  <When at={grant.grantedAt} fallback="never" className="repo-automation__when" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="repo-automation__note">
              Nobody holds a grant on this repository yet.
            </p>
          )
        ) : (
          <p className="repo-automation__note" data-testid="repo-automation-grants-hidden">
            Only a repository administrator can see who holds which access.
          </p>
        )}
      </section>

      <section
        className="page__section"
        aria-labelledby="repo-mirrors"
        data-testid="repo-mirrors"
      >
        <h2 className="page__section-title" id="repo-mirrors">
          Mirrors
        </h2>
        {view.mirrors.length === 0 ? (
          <p className="repo-automation__note">
            This repository is not mirrored anywhere.
          </p>
        ) : (
          <ul className="repo-automation__list">
            {view.mirrors.map((mirror) => (
              <li key={mirror.target} className={toneClass(mirrorTone(mirror))}>
                <a
                  className="repo-automation__name"
                  href={mirror.target}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {mirror.target}
                </a>
                <span className="page__pill">{mirror.direction}</span>
                <span className="repo-automation__state">
                  {mirror.refs.join(', ')}
                </span>
                <span className="repo-automation__state">
                  {mirrorStatusText(mirror)}
                </span>
                {mirror.lastPushedSha ? (
                  <code className="repo-automation__sha">
                    {shortSha(mirror.lastPushedSha)}
                  </code>
                ) : null}
                <When at={mirror.lastPushedAt} fallback="never" className="repo-automation__when" />
                {mirror.lastError ? (
                  <span className="repo-automation__state">
                    {mirror.lastError}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
