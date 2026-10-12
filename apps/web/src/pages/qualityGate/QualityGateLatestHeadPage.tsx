// QualityGateLatestHeadPage.tsx — a repository's newest score, at
// `/quality-gate/heads/:owner/:name?branch=<branch>&repo=<repository id>`.
//
// The score badge on the repository list and on a repository's own page is the
// newest audit of its default branch, but the summary that carries it does not
// say which commit was scored. The badge links here; this page reads the
// branch's scores, takes the newest, and replaces itself with that head's page,
// so the reader lands on the score they clicked and Back skips this hop. The
// scores are read by the opaque repository id the badge carries (`repo`), the
// key `/api/v1/repos/:id` takes; owner and name only title the page.

import { Gauge } from 'lucide-react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState, LoadingState } from '../../components/state';
import { PageHeader } from '../../components/pageHeader';
import { useRepoBranchScores } from '../../hooks/useQualityGate';
import { usePageTitle } from '../../hooks/usePageTitle';
import { QualityGateQueryState } from './QualityGateQueryState';
import { QUALITY_GATE_PATH, newestBranchScore, qualityGateHeadPath } from './qualityGateModel';
import '../page.css';
import './QualityGate.css';

export function QualityGateLatestHeadPage(): JSX.Element {
  const { owner = '', name = '' } = useParams();
  const [params] = useSearchParams();
  const branch = params.get('branch') ?? '';
  const repoId = params.get('repo') ?? '';
  const repo = owner && name ? `${owner}/${name}` : '';
  usePageTitle(repo ? `${repo} · Quality gate` : 'Quality gate');
  const scores = useRepoBranchScores(repoId, branch);
  const newest = newestBranchScore(scores.data?.scores ?? [], branch);

  if (newest) {
    return <Navigate replace to={qualityGateHeadPath(repo, newest.commit_sha)} />;
  }

  return (
    <div className="page page--wide" data-testid="quality-gate-latest-page">
      <PageHeader
        title={repo}
        testId="quality-gate-latest-header"
        parent="nav.quality-gate"
        crumbs={[{ label: repo }]}
        subtitle={
          <>
            The newest <code>jankurai/proof</code> score of {branch}.
          </>
        }
      />
      {!repoId || !branch ? (
        <EmptyState
          icon={Gauge}
          title="This link does not say which repository and branch to read."
          description="Open the score from the repository list or the repository's page."
          action={<Link to={QUALITY_GATE_PATH}>All scores</Link>}
        />
      ) : scores.isPending ? (
        <LoadingState title="Finding the newest score…" variant="message" />
      ) : scores.isError ? (
        <QualityGateQueryState what="this repository's scores" error={scores.error} />
      ) : (
        <EmptyState
          icon={Gauge}
          title={`No score recorded for ${branch} yet.`}
          description="A score appears once an audit of this branch is ingested."
          action={<Link to={QUALITY_GATE_PATH}>All scores</Link>}
        />
      )}
    </div>
  );
}
