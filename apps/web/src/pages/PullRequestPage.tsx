// PullRequestPage.tsx — one pull request, as four tabs behind one bar.
//
//   ┌──────────────────────────────────────────────────────────────────┐
//   │ PR #42: title   Open   acme/widget-api · by dana   head → base   │
//   ├──────────────────────────────────────────────────────────────────┤
//   │ Conversation | Files 3 | Checks 1 | Commits 5                    │
//   └──────────────────────────────────────────────────────────────────┘
//
// Conversation is the default: the description, the reviews, one merge box saying where
// the merge stands, the threads, and the pipeline timeline. Files, Checks and
// Commits are their own URLs (`/pulls/:n/files?path=`, `/checks`, `/commits`),
// so each one has the whole width and none of them sits below the fold of a
// nested scroller. The header carries one neutral state pill — Open, Draft,
// Merged or Closed — and the merge verdict is stated once, in the box.
//
// A refused approval that is not head drift (`pull_self_approval_forbidden`
// above all, since an author cannot approve their own pull request) is worded
// by `approveRefusal` and shown next to the Approve button.
//
// A merge queue entry that failed or left the queue is the one case where the
// queue stops and a person starts: Conversation then offers "Queue again"
// (`components/merge/QueueAgain`), above the box.
//
// Conversation also carries the Work section: where the change stands on the
// twelve-stage work trace, which todos the pull request carries, and the
// Needs-you row about it (`PullRequestWork`).
//
// On approve mutation 409 with `merge_sha_stale`, the page shows a recovery
// banner with the previous/current SHA and a Refresh button that re-runs the
// detail query. The banner also appears for `merge_passport_stale` /
// `concurrency_conflict` so reviewers see all known drift cases.

import { GitBranch, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import { QueueAgain, type DiffViewerMode } from '../components/merge';
import {
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useApprovePr } from '../hooks/useApprovePr';
import { useAuth } from '../hooks/useAuth';
import { useBootstrap } from '../hooks/useBootstrap';
import { useMergeAttempt } from '../hooks/useMergeAttempt';
import { useMergePr } from '../hooks/useMergePr';
import { useSetPullState } from '../hooks/useSetPullState';
import { useSetPullDraft } from '../hooks/useSetPullDraft';
import { useSubmitReview } from '../hooks/useSubmitReview';
import { usePullRequest } from '../hooks/usePullRequest';
import { prChecksQueryKey, usePrChecks } from '../hooks/usePrChecks';
import { repoScope, useRunnerChangeNudge } from '../hooks/useRunnerChangeNudge';
import { usePrDiff } from '../hooks/usePrDiff';
import { usePrThreads } from '../hooks/usePrThreads';
import { usePullCommits } from '../hooks/usePullCommits';
import { useRealtime } from '../hooks/useRealtime';
import { useResolveRepo } from '../hooks/useResolveRepo';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useSelectionStore } from '../stores/selectionStore';
import { mergeAttemptLine } from '../components/merge/mergeAttemptModel';
import {
  approveRefusal,
  draftRefusal,
  failingChecksBlockMerge,
  isSettled,
  pullStateBadge,
} from '../components/merge/pullReviewModel';
import { When } from '../format/When';
import { ChecksPanel } from '../components/merge';
import { TabBar } from '../components/repo/TabBar';
import { PullConversationTab } from './PullConversationTab';
import { PullFilesTab } from './PullFilesTab';
import { PullRequestCommits } from './PullRequestCommits';
import { PullRequestWork } from './PullRequestWork';
import {
  PULL_TABS,
  pullBasePath,
  pullTabCount,
  pullTabHref,
  type PullTabKey,
} from './pullTabsModel';
import {
  extractDrift,
  type HeadDriftInfo,
} from './pullRequestDrift';
import { repoFrontPath } from './repoBrowserModel';

import './page.css';

function fullNameFromParams(params: Record<string, string | undefined>): string {
  return params.fullName ?? '';
}

export interface PullRequestPageProps {
  provider?: string;
  fullName?: string;
  prNumber?: string;
  /** Which tab the URL is on; Conversation when the URL names none. */
  tab?: PullTabKey;
}

export function PullRequestPage(props: PullRequestPageProps = {}): JSX.Element {
  const params = useParams();
  const provider = props.provider ?? params.provider ?? 'unknown';
  const fullName = props.fullName ?? fullNameFromParams(params);
  const prNumber = props.prNumber ?? params.number ?? null;
  const tab: PullTabKey = props.tab ?? 'conversation';

  const authUser = useAuth().user;
  const viewerLogin = authUser?.login ?? null;
  const resolved = useResolveRepo(provider, fullName);
  const repoId = resolved.data?.id ?? null;
  const setPr = useSelectionStore((s) => s.setCurrentPr);
  const setRepo = useSelectionStore((s) => s.setCurrentRepo);

  useEffect(() => {
    setRepo(repoId);
    return () => setRepo(null);
  }, [repoId, setRepo]);

  useEffect(() => {
    if (!prNumber) return () => {};
    setPr(prNumber);
    return () => setPr(null);
  }, [prNumber, setPr]);

  useRealtime(prNumber ? [`pull.${prNumber}`] : []);

  const detail = usePullRequest(repoId, prNumber);
  const diff = usePrDiff(repoId, prNumber);
  const checks = usePrChecks(repoId, prNumber);
  // A gate starting or finishing on this repository refetches the checks.
  useRunnerChangeNudge(
    repoScope(fullName),
    prChecksQueryKey(repoId, prNumber),
    Boolean(checks.data?.server_time)
  );
  const threads = usePrThreads(repoId, prNumber);
  // The commits come from the GitHub-shaped edge, which addresses the
  // repository by owner/name rather than by the resolved repo id.
  const [prOwner = '', prRepo = ''] = fullName.split('/');
  const commits = usePullCommits(prOwner, prRepo, prNumber);

  const approve = useApprovePr(repoId, prNumber);
  const mergeMutation = useMergePr(repoId, prNumber);
  const mergeAttempt = useMergeAttempt(repoId, prNumber);
  const review = useSubmitReview(repoId, prNumber);
  // Close / reopen goes through the forge's GitHub-shaped edge, which keys on
  // `owner/name` rather than the opaque repository id.
  const setState = useSetPullState(resolved.data?.summary.id ?? null, prNumber);

  // Who is looking: the bootstrap viewer names the login and the permission
  // keys the Close / Reopen button is gated on.
  const bootstrap = useBootstrap();
  const viewer = useMemo(
    () => ({
      login: bootstrap.data?.viewer.login ?? null,
      permissions: bootstrap.data?.viewer.global_permissions ?? [],
    }),
    [bootstrap.data]
  );

  const setDraft = useSetPullDraft(repoId, prNumber);

  // Which file of the diff is open is a property of the URL, so a thread, a
  // review comment or a bookmark can point at one file.
  const [search, setSearch] = useSearchParams();
  const diffMode = usePreferencesStore((s) => s.diffMode);
  const setDiffMode = usePreferencesStore((s) => s.setDiffMode);

  const requestedPath = search.get('path');
  // With no file named, the first changed file is the one on screen.
  const activeFilePath =
    requestedPath ?? diff.data?.files[0]?.path ?? null;

  const setActiveFilePath = useCallback(
    (path: string) => {
      const next = new URLSearchParams(search);
      next.set('path', path);
      setSearch(next, { replace: true });
    },
    [search, setSearch]
  );

  const activeFile = useMemo(() => {
    if (!diff.data || !activeFilePath) return;
    return diff.data.files.find((f) => f.path === activeFilePath);
  }, [diff.data, activeFilePath]);

  const handleApprove = useCallback(
    async (expectedHeadSha: string) => {
      approve.reset();
      // A refusal lands in `approve.error` and is worded in the review pane;
      // swallow the rejection here so the click is never a silent no-op.
      await approve
        .mutateAsync({ expected_head_sha: expectedHeadSha })
        .catch(() => undefined);
    },
    [approve]
  );

  const handleRequestChanges = useCallback(
    async (expectedHeadSha: string, body: string) => {
      review.reset();
      await review.mutateAsync({
        verdict: 'request_changes',
        expected_head_sha: expectedHeadSha,
        body_markdown: body,
        thread_comments: [],
        evidence: null,
      });
    },
    [review]
  );

  const handleMerge = useCallback(
    async (input: {
      expectedHeadSha: string;
      expectedPassportHash: string | null;
      method: 'merge' | 'squash' | 'rebase';
    }) => {
      mergeMutation.reset();
      // A refusal lands in `mergeMutation.error` and is shown in the review
      // pane; swallow the rejection here so it never becomes a silent no-op.
      await mergeMutation
        .mutateAsync({
          expected_head_sha: input.expectedHeadSha,
          expected_passport_hash: input.expectedPassportHash,
          merge_method: input.method,
        })
        .catch(() => undefined);
    },
    [mergeMutation]
  );

  const handleSetState = useCallback(
    async (input: { state: 'open' | 'closed'; comment: string | null }) => {
      setState.reset();
      // A refusal lands in `setState.error` and is shown next to the button.
      await setState.mutateAsync(input).catch(() => undefined);
    },
    [setState]
  );

  // The draft lifecycle. The forge answers the updated detail, which the hook
  // writes into the cache, so the Passport's draft blocker clears in place; a
  // refusal is worded next to the control rather than thrown away.
  const handleSetDraft = useCallback(
    async (draft: boolean) => {
      setDraft.reset();
      await setDraft.mutateAsync({ draft }).catch(() => undefined);
    },
    [setDraft]
  );

  // Aggregate the head-drift signal from either mutation.
  const headDrift = useMemo<HeadDriftInfo | undefined>(() => {
    const approveErr = approve.error;
    const mergeErr = mergeMutation.error;
    if (approveErr instanceof ApiError) {
      const info = extractDrift(approveErr);
      if (info) return info;
    }
    if (mergeErr instanceof ApiError) {
      const info = extractDrift(mergeErr);
      if (info) return info;
    }
    if (review.error instanceof ApiError) {
      const info = extractDrift(review.error);
      if (info) return info;
    }
    return;
  }, [approve.error, mergeMutation.error, review.error]);

  const handleRefresh = useCallback(() => {
    approve.reset();
    mergeMutation.reset();
    review.reset();
    setDraft.reset();
    void detail.refetch();
    void diff.refetch();
    void checks.refetch();
    void threads.refetch();
    void commits.refetch();
  }, [approve, mergeMutation, review, setDraft, detail, diff, checks, threads, commits]);

  // ── Loading + error guards. ────────────────────────────────────────
  if (resolved.isPending) {
    return (
      <div className="page">
        <LoadingState
          title={`Loading pull request #${prNumber}…`}
          variant="message"
          description="Resolving the repository."
        />
      </div>
    );
  }

  if (resolved.error || !resolved.data) {
    if (resolved.error instanceof ApiError && resolved.error.status === 403) {
      return (
        <div className="page">
          <PermissionDeniedState
            description="You do not have permission to view this pull request."
            missingPermission="repo.read"
          />
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorState
          title="Repository not found"
          description={resolved.error?.message ?? `No repository ${fullName}.`}
        />
      </div>
    );
  }

  if (detail.isPending) {
    return (
      <div className="page">
        <LoadingState title="Loading pull request…" variant="message" />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    if (detail.error instanceof ApiError && detail.error.status === 403) {
      return (
        <div className="page">
          <PermissionDeniedState
            description="You do not have permission to view this pull request."
            missingPermission="pr.read"
          />
        </div>
      );
    }
    return (
      <div className="page">
        <ErrorState
          title="Could not load pull request"
          error={detail.error}
        />
      </div>
    );
  }

  const data = detail.data;
  const summary = data.summary;

  const badge = pullStateBadge(summary);
  const settled = isSettled(data);
  const base = pullBasePath(provider, fullName, prNumber ?? '');
  const isBusy =
    approve.isPending ||
    mergeMutation.isPending ||
    review.isPending ||
    setState.isPending ||
    setDraft.isPending;

  const tabs = PULL_TABS.map((entry) => ({
    key: entry.key,
    label: entry.label,
    href: pullTabHref(base, entry),
    count: pullTabCount(entry.key, {
      files: diff.data?.files.length ?? null,
      failingChecks: checks.data?.failing ?? null,
      commits: commits.data?.length ?? null,
    }),
  }));

  return (
    <div className="page page--full pr-page" data-testid="pr-page">
      <div className="pr-cockpit__header">
        <h1 className="pr-cockpit__title">
          Pull request #{summary.number}: {summary.title}
        </h1>
        <span
          className={`pr-cockpit__state pr-cockpit__state--${badge.tone}`}
          data-testid="pr-state-badge"
        >
          {badge.label}
        </span>
        <span className="pr-cockpit__meta">
          <Link to={repoFrontPath(provider, fullName)}>{fullName}</Link>
          <span aria-hidden="true">·</span>
          <span>by {summary.author}</span>
          <span aria-hidden="true">·</span>
          <span title={summary.updated_at}>
            {settled ? `${badge.label.toLowerCase()} ` : 'updated '}
            <When at={summary.updated_at} />
          </span>
        </span>
        <span className="pr-cockpit__meta">
          <GitBranch aria-hidden="true" size={12} />
          <code>{summary.head_ref}</code>
          <span aria-hidden="true">→</span>
          <code>{summary.base_ref}</code>
        </span>
        <span className="pr-cockpit__meta">
          <code title={summary.head_sha}>{summary.head_sha.slice(0, 7)}</code>
        </span>
      </div>

      <TabBar
        label="Pull request"
        items={tabs}
        current={tab}
        testId="pr-tabs"
        idPrefix="pr-tab"
      />

      {headDrift ? (
        <div className="pr-cockpit__recovery" role="alert">
          <div className="pr-cockpit__recovery-title">
            <ShieldAlert aria-hidden="true" size={14} />
            {headDrift.code === 'merge_passport_stale'
              ? 'Merge Passport recomputed since you opened this view.'
              : headDrift.code === 'concurrency_conflict'
              ? 'Another reviewer touched this pull request.'
              : 'Head SHA changed since you opened this view.'}
          </div>
          {headDrift.expected && headDrift.current ? (
            <div className="pr-cockpit__recovery-shas">
              Head changed from <code>{headDrift.expected.slice(0, 7)}</code>
              {' '}→ <code>{headDrift.current.slice(0, 7)}</code>. Refresh to
              re-review.
            </div>
          ) : (
            <div className="pr-cockpit__recovery-shas">
              Refresh to load the latest snapshot before re-reviewing.
            </div>
          )}
          <ActionButton
            variant="primary"
            icon={<RefreshCcw aria-hidden="true" size={12} />}
            onClick={handleRefresh}
          >
            Refresh
          </ActionButton>
        </div>
      ) : null}

      {!settled && mergeAttemptLine(mergeAttempt.data) ? (
        <div
          className="pr-cockpit__recovery"
          role="status"
          data-testid="pr-merge-attempt"
        >
          <div className="pr-cockpit__recovery-title">
            <ShieldAlert aria-hidden="true" size={14} />
            {mergeAttemptLine(mergeAttempt.data)}
          </div>
        </div>
      ) : null}

      <div className="pr-page__body">
        {tab === 'files' ? (
          <PullFilesTab
            diff={diff}
            activePath={activeFilePath}
            activeFile={activeFile}
            diffMode={diffMode}
            onSelectFile={setActiveFilePath}
            onDiffModeChange={(mode: DiffViewerMode) => setDiffMode(mode)}
          />
        ) : tab === 'checks' ? (
          <div data-testid="pr-checks-tab">
            <ChecksPanel
              checks={checks.data ?? null}
              receivedAtMs={checks.dataUpdatedAt}
              isLoading={checks.isPending}
              failuresBlockMerge={!settled && failingChecksBlockMerge(data)}
              className="pr-page__panel"
            />
          </div>
        ) : tab === 'commits' ? (
          <PullRequestCommits
            commits={commits.data}
            isPending={commits.isPending}
            error={commits.error}
          />
        ) : (
          <PullConversationTab
            base={base}
            description={data.description}
            reviews={data.reviews ?? []}
            threads={threads}
            repoFullName={fullName}
            prNumber={prNumber}
            queueAgain={
              <QueueAgain repoId={repoId} prNumber={prNumber} enabled={!settled} />
            }
            work={
              <PullRequestWork
                summary={summary}
                commits={commits.data}
                repoId={repoId}
                repoFullName={fullName}
                prNumber={prNumber}
              />
            }
            merge={{
              detail: data,
              checks: checks.data ?? null,
              checksLoading: checks.isPending,
              hrefs: {
                threads: `${base}#pr-threads`,
                checks: `${base}/checks`,
                commits: `${base}/commits`,
              },
              viewer,
              viewerLogin,
              viewerRole: authUser?.role ?? null,
              isBusy,
              onApprove: handleApprove,
              onRequestChanges: handleRequestChanges,
              onMerge: handleMerge,
              onSetState: handleSetState,
              onSetDraft: handleSetDraft,
              approveRefusal:
                approve.error && !headDrift
                  ? approveRefusal(approve.error, data)
                  : null,
              draftRefusal: setDraft.error
                ? draftRefusal(setDraft.error, setDraft.variables?.draft ?? false)
                : null,
              reviewError:
                review.error && !headDrift ? review.error.message : null,
              mergeError:
                mergeMutation.error && !headDrift
                  ? mergeMutation.error.message
                  : null,
              closeError: setState.error ? setState.error.message : null,
            }}
          />
        )}
      </div>
    </div>
  );
}
