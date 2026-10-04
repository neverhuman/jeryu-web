// QualityGateHeadPage.tsx — one scored head, at
// `/quality-gate/heads/:owner/:name/:sha`.
//
// The end of the drill-down: the score against the floor and every finding
// behind it. A finding says where it is (`path:line`), quotes the evidence it
// read, and links to that line of the repository at the scored commit, so the
// reader can check it without leaving the forge.
//
// An admin who thinks a finding is wrong says so here. The dispute is recorded
// with a reason; it changes no score, it is how the owner learns whether the
// gate is accurate enough to be required.

import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { QualityGateAppliedCap, QualityGateFinding } from '../../api/types';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import { useForgeHost } from '../../hooks/useForgeHost';
import { useDisputeFinding, useQualityGateHead } from '../../hooks/useQualityGate';
import { QualityGateQueryState } from './QualityGateQueryState';
import { QUALITY_GATE_PATH, repoCodeHref, shortSha } from './qualityGateModel';
import { usePageTitle } from '../../hooks/usePageTitle';
import '../page.css';
import './QualityGate.css';
import { When } from '../../format/When';

export function QualityGateHeadPage(): JSX.Element {
  const { owner = '', name = '', sha = '' } = useParams();
  const repo = owner && name ? `${owner}/${name}` : '';
  usePageTitle(repo ? `${repo}@${sha.slice(0, 7)} · Quality gate` : 'Quality gate');
  const { data, isPending, isError, error } = useQualityGateHead(repo, sha);
  const { user } = useAuth();
  const forgeHost = useForgeHost();
  const dispute = useDisputeFinding(repo, sha);
  const [openFor, setOpenFor] = useState<string | null>(null);

  return (
    <div className="page page--wide" data-testid="quality-gate-head-page">
      <header className="page__header">
        <Link className="quality-gate__back" to={QUALITY_GATE_PATH}>
          <ChevronLeft aria-hidden="true" size={14} />
          Quality gate
        </Link>
        <h1 className="page__title">
          {repo}@{shortSha(sha)}
        </h1>
        <p className="page__subtitle">
          The <code>jankurai/proof</code> score of this head and the findings
          behind it.
        </p>
      </header>

      {isPending ? (
        <LoadingState title="Loading the score detail…" variant="message" />
      ) : isError ? (
        <QualityGateQueryState what="this score" error={error} />
      ) : (
        <>
          <section className="page__section" aria-labelledby="quality-gate-score">
            <h2 className="page__section-title" id="quality-gate-score">
              Score
            </h2>
            <p className="quality-gate__score" data-testid="quality-gate-score">
              <span
                className={
                  data.passed
                    ? 'page__pill page__pill--success'
                    : 'page__pill page__pill--danger'
                }
              >
                {data.score} / {data.threshold}
              </span>{' '}
              {data.passed
                ? 'at or above the floor.'
                : 'below the floor: the gate would have blocked this push.'}{' '}
              Scored <When at={data.scored_at} /> on {data.branch}.
            </p>
          </section>

          <section className="page__section" aria-labelledby="quality-gate-caps">
            <h2 className="page__section-title" id="quality-gate-caps">
              Applied caps
            </h2>
            {(data.caps ?? []).length === 0 ? (
              <p className="quality-gate__cap-none" data-testid="quality-gate-no-caps">
                No cap held this score down.
              </p>
            ) : (
              <ul className="quality-gate__caps" data-testid="quality-gate-caps">
                {(data.caps ?? []).map((cap) => (
                  <CapRow key={cap.id} cap={cap} />
                ))}
              </ul>
            )}
          </section>

          <section className="page__section" aria-labelledby="quality-gate-findings">
            <h2 className="page__section-title" id="quality-gate-findings">
              Findings
            </h2>
            {data.findings.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No finding on this head."
                description="Every rule the score runs was satisfied at this commit."
              />
            ) : (
              <ul className="quality-gate__findings">
                {data.findings.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    repo={data.repo}
                    host={forgeHost(data.repo)}
                    sha={data.sha}
                    canDispute={user?.role === 'admin'}
                    open={openFor === finding.id}
                    onToggle={() =>
                      setOpenFor((current) => (current === finding.id ? null : finding.id))
                    }
                    onSubmit={(reason) =>
                      dispute.mutate(
                        { findingId: finding.id, reason },
                        { onSuccess: () => setOpenFor(null) }
                      )
                    }
                    pending={dispute.isPending}
                    error={
                      dispute.isError && dispute.variables?.findingId === finding.id
                        ? dispute.error
                        : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** One applied cap: the rule, what it means, and what clears it. */
function CapRow({ cap }: { cap: QualityGateAppliedCap }): JSX.Element {
  return (
    <li className="quality-gate__cap" data-testid={`quality-gate-cap-${cap.id}`}>
      <div className="quality-gate__finding-head">
        <span className="page__pill">{cap.id}</span>
        <span className="quality-gate__finding-title">{cap.meaning}</span>
      </div>
      <p className="quality-gate__cap-clear">{cap.how_to_clear}</p>
    </li>
  );
}

function FindingRow({
  finding,
  repo,
  host,
  sha,
  canDispute,
  open,
  onToggle,
  onSubmit,
  pending,
  error,
}: {
  finding: QualityGateFinding;
  repo: string;
  host: string;
  sha: string;
  canDispute: boolean;
  open: boolean;
  onToggle: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
  error?: unknown;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (reason.trim() === '') return;
    onSubmit(reason.trim());
  };
  return (
    <li className="quality-gate__finding" data-testid={`quality-gate-finding-${finding.id}`}>
      <div className="quality-gate__finding-head">
        <span className="page__pill">{finding.rule}</span>
        <span className="quality-gate__finding-title">{finding.title}</span>
        {finding.disputed ? (
          <span className="page__pill page__pill--warning">Disputed</span>
        ) : null}
      </div>
      <a
        className="quality-gate__finding-where"
        href={repoCodeHref(host, repo, sha, finding.path, finding.line)}
      >
        {finding.path}:{finding.line}
      </a>
      <pre className="quality-gate__evidence">
        <code>{finding.evidence}</code>
      </pre>
      {finding.disputed ? (
        <p className="quality-gate__dispute-note">
          Disputed by {finding.disputed_by ?? 'an admin'}: {finding.dispute_reason}
        </p>
      ) : canDispute ? (
        <>
          <button
            type="button"
            className="quality-gate__dispute"
            aria-expanded={open}
            onClick={onToggle}
          >
            Dispute this finding
          </button>
          {open ? (
            <form className="quality-gate__dispute-form" onSubmit={submit}>
              <label htmlFor={`dispute-reason-${finding.id}`}>
                Why is this finding wrong?
              </label>
              <textarea
                id={`dispute-reason-${finding.id}`}
                value={reason}
                rows={2}
                onChange={(event) => setReason(event.target.value)}
              />
              <button type="submit" disabled={pending || reason.trim() === ''}>
                {pending ? 'Recording…' : 'Record dispute'}
              </button>
            </form>
          ) : null}
          {error ? <ErrorState title="Could not record the dispute." error={error} /> : null}
        </>
      ) : null}
    </li>
  );
}
