// RepositoryMirrorSection.tsx — Settings > Mirror.

import type { AutomationMirror } from '../api/types';
import { pillClass } from '../components/tone/tone';
import { When } from '../format/When';
import {
  firstMirror,
  mirrorDirectionText,
  mirrorStateText,
  mirrorTitle,
  mirrorTone,
  shortSha,
} from './repositoryMirrorModel';

import './page.css';

export interface RepositoryMirrorSectionProps {
  mirrors: readonly AutomationMirror[] | null | undefined;
  loading?: boolean;
  failed?: boolean;
}

export function RepositoryMirrorSection({
  mirrors,
  loading = false,
  failed = false,
}: RepositoryMirrorSectionProps): JSX.Element {
  const mirror = firstMirror(mirrors);
  if (loading) {
    return (
      <section
        className="page__section mirror-section"
        id="mirror"
        aria-labelledby="mirror-title"
        data-testid="settings-mirror"
      >
        <h2 className="page__section-title" id="mirror-title">Mirror</h2>
        <p className="text-muted">Loading mirror facts…</p>
      </section>
    );
  }
  if (failed) {
    return (
      <section
        className="page__section mirror-section"
        id="mirror"
        aria-labelledby="mirror-title"
        data-testid="settings-mirror"
      >
        <h2 className="page__section-title" id="mirror-title">Mirror</h2>
        <p className="text-muted">This forge did not answer mirror facts.</p>
      </section>
    );
  }
  if (!mirror) {
    return (
      <section
        className="page__section mirror-section"
        id="mirror"
        aria-labelledby="mirror-title"
        data-testid="settings-mirror"
      >
        <h2 className="page__section-title" id="mirror-title">Mirror</h2>
        <p>Not mirrored</p>
      </section>
    );
  }

  const tone = mirrorTone(mirror);
  const tagDrift = mirror.tagDrift ?? [];
  return (
    <section
      className={`page__section mirror-section mirror-section--${tone}`}
      id="mirror"
      aria-labelledby="mirror-title"
      data-testid="settings-mirror"
    >
      <h2 className="page__section-title" id="mirror-title">Mirror</h2>
      <div className="mirror-section__summary">
        <a
          href={mirror.target}
          target="_blank"
          rel="noopener noreferrer"
          className="mirror-section__target"
        >
          {mirrorTitle(mirror)}
        </a>
        <span className={pillClass(tone)}>{mirrorStateText(mirror)}</span>
      </div>
      <dl className="mirror-section__facts">
        <div>
          <dt>Direction</dt>
          <dd>{mirrorDirectionText(mirror)}</dd>
        </div>
        <div>
          <dt>Refs</dt>
          <dd>{mirror.refs.length > 0 ? mirror.refs.join(', ') : 'none listed'}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd><When at={mirror.lastCheckedAt} fallback="never" /></dd>
        </div>
        <div>
          <dt>Last successful push</dt>
          <dd>
            <When at={mirror.lastPushedAt} fallback="never" />
            {mirror.lastPushedSha ? <> · <code>{shortSha(mirror.lastPushedSha)}</code></> : null}
          </dd>
        </div>
        <div>
          <dt>Last error</dt>
          <dd>{mirror.lastError ?? 'none'}</dd>
        </div>
      </dl>
      <div className="mirror-section__tag-drift">
        <h3>Tag drift</h3>
        {tagDrift.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Forge</th>
                <th scope="col">Mirror</th>
              </tr>
            </thead>
            <tbody>
              {tagDrift.map((row) => (
                <tr key={row.ref}>
                  <td>{row.ref}</td>
                  <td><code>{shortSha(row.forgeSha)}</code></td>
                  <td><code>{shortSha(row.mirrorSha)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">No tag drift.</p>
        )}
      </div>
    </section>
  );
}
