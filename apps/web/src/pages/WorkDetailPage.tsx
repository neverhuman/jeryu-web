import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { apiGet, apiPatch, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  CreateWorkCommentRequest,
  CreateWorkLinkRequest,
  UpdateWorkItemRequest,
  WorkComment,
  WorkItem,
  WorkItemDetail,
  WorkItemKind,
  WorkPriority,
  WorkStatus,
} from '../api/types';
import {
  WORK_KINDS,
  WORK_KIND_LABELS,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABELS,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  csvTokens,
  displayPrincipal,
  principalsFromInput,
  workRepoName,
} from './workModel';

import './page.css';
import './WorkPage.css';

interface EditState {
  title: string;
  body: string;
  status: WorkStatus;
  kind: WorkItemKind;
  priority: WorkPriority;
  labels: string;
  assignees: string;
}

export function WorkDetailPage(): JSX.Element {
  const params = useParams();
  const key = params.key ?? '';
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [pullOwner, setPullOwner] = useState('');
  const [pullRepo, setPullRepo] = useState('');
  const [pullNumber, setPullNumber] = useState('');

  const detail = useQuery({
    queryKey: ['work-detail', key],
    queryFn: ({ signal }) =>
      apiGet<WorkItemDetail>(endpoints.workItem(key), { signal }),
    enabled: key.length > 0,
    staleTime: 10_000,
  });

  const edit = useMemo<EditState | null>(() => {
    const item = detail.data?.item;
    if (!item) return null;
    return {
      title: item.title,
      body: item.body ?? '',
      status: item.status,
      kind: item.kind,
      priority: item.priority,
      labels: item.labels.join(', '),
      assignees: item.assignees
        .map((assignee) =>
          assignee.kind === 'agent' ? `agent:${assignee.id}` : assignee.id
        )
        .join(', '),
    };
  }, [detail.data]);
  const [draft, setDraft] = useState<EditState | null>(null);
  const current = draft ?? edit;

  const saveItem = useMutation({
    mutationFn: (request: UpdateWorkItemRequest) =>
      apiPatch<WorkItem>(endpoints.workItem(key), request),
    onSuccess: async () => {
      setDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['work-detail', key] }),
        queryClient.invalidateQueries({ queryKey: ['work'] }),
        queryClient.invalidateQueries({ queryKey: ['repo-work'] }),
      ]);
    },
  });

  const addComment = useMutation({
    mutationFn: (request: CreateWorkCommentRequest) =>
      apiSend<WorkComment>(endpoints.workComments(key), request),
    onSuccess: async () => {
      setComment('');
      await queryClient.invalidateQueries({ queryKey: ['work-detail', key] });
    },
  });

  const addLink = useMutation({
    mutationFn: (request: CreateWorkLinkRequest) =>
      apiSend<WorkItem>(endpoints.workLinks(key), request),
    onSuccess: async () => {
      setPullOwner('');
      setPullRepo('');
      setPullNumber('');
      await queryClient.invalidateQueries({ queryKey: ['work-detail', key] });
    },
  });

  function patchDraft(change: Partial<EditState>): void {
    setDraft({ ...(current ?? emptyEdit()), ...change });
  }

  function submitSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!current) return;
    saveItem.mutate({
      title: current.title.trim(),
      body: current.body.trim() || null,
      status: current.status,
      kind: current.kind,
      priority: current.priority,
      labels: csvTokens(current.labels),
      assignees: principalsFromInput(current.assignees),
    });
  }

  function submitComment(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const body = comment.trim();
    if (!body) return;
    addComment.mutate({ body, author: null });
  }

  function submitPullLink(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const owner = pullOwner.trim();
    const repo = pullRepo.trim();
    const parsed = Number.parseInt(pullNumber.trim(), 10);
    if (!owner || !repo || !Number.isFinite(parsed) || parsed < 1) return;
    addLink.mutate({
      issue: null,
      pull_request: {
        owner,
        repo,
        number: parsed,
        url: `/repos/jeryu/${owner}/${repo}/pulls/${parsed}`,
      },
    });
  }

  if (detail.isPending) {
    return (
      <div className="page" data-testid="work-detail-page">
        <p className="page__roadmap-note">Loading work item.</p>
      </div>
    );
  }

  if (detail.isError || !detail.data || !current) {
    return (
      <div className="page" data-testid="work-detail-page">
        <header className="page__header">
          <h1 className="page__title">Work</h1>
        </header>
        <p className="page__roadmap-note">
          {detail.error?.message ?? 'Work item not found.'}
        </p>
      </div>
    );
  }

  const item = detail.data.item;

  return (
    <div className="page page--full work-detail" data-testid="work-detail-page">
      <header className="page__header work-detail__header">
        <div>
          <Link className="work-detail__back" to="/work">
            Work
          </Link>
          <h1 className="page__title">{item.key}</h1>
          <p className="page__subtitle">{item.title}</p>
        </div>
        <div className="work-detail__facts">
          <Fact label="Repo" value={workRepoName(item)} />
          <IssueFact issue={item.issue} />
          <Fact label="Updated" value={formatDate(item.updated_at)} />
        </div>
      </header>

      <div className="work-detail__grid">
        <form className="work-detail__panel work-detail__edit" onSubmit={submitSave}>
          <label className="work-detail__wide">
            Title
            <input
              value={current.title}
              onChange={(event) => patchDraft({ title: event.target.value })}
              required
            />
          </label>
          <label>
            Status
            <select
              value={current.status}
              onChange={(event) =>
                patchDraft({ status: event.target.value as WorkStatus })
              }
            >
              {WORK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {WORK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind
            <select
              value={current.kind}
              onChange={(event) =>
                patchDraft({ kind: event.target.value as WorkItemKind })
              }
            >
              {WORK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {WORK_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={current.priority}
              onChange={(event) =>
                patchDraft({ priority: event.target.value as WorkPriority })
              }
            >
              {WORK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {WORK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Labels
            <input
              value={current.labels}
              onChange={(event) => patchDraft({ labels: event.target.value })}
            />
          </label>
          <label>
            Assignees
            <input
              value={current.assignees}
              onChange={(event) => patchDraft({ assignees: event.target.value })}
            />
          </label>
          <label className="work-detail__wide">
            Body
            <textarea
              value={current.body}
              onChange={(event) => patchDraft({ body: event.target.value })}
              rows={8}
            />
          </label>
          <button type="submit" disabled={saveItem.isPending || !current.title.trim()}>
            Save
          </button>
          {saveItem.isError ? (
            <p className="work-page__error">{saveItem.error.message}</p>
          ) : null}
        </form>

        <aside className="work-detail__panel work-detail__side">
          <section>
            <h2>Assignees</h2>
            <div className="work-card__chips">
              {item.assignees.length === 0 ? (
                <span className="work-detail__muted">Unassigned</span>
              ) : (
                item.assignees.map((assignee) => (
                  <span className="work-chip work-chip--person" key={assignee.id}>
                    {displayPrincipal(assignee)}
                  </span>
                ))
              )}
            </div>
          </section>
          <section>
            <h2>Pull requests</h2>
            {item.pull_requests.length === 0 ? (
              <p className="work-detail__muted">No linked pull requests.</p>
            ) : (
              <ul className="work-detail__links">
                {item.pull_requests.map((pull) => (
                  <li key={`${pull.owner}/${pull.repo}/${String(pull.number)}`}>
                    {pull.url ? (
                      <a href={pull.url}>{pull.owner}/{pull.repo}#{String(pull.number)}</a>
                    ) : (
                      <span>{pull.owner}/{pull.repo}#{String(pull.number)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form className="work-detail__link-form" onSubmit={submitPullLink}>
              <input
                value={pullOwner}
                onChange={(event) => setPullOwner(event.target.value)}
                placeholder="owner"
                aria-label="Pull request owner"
              />
              <input
                value={pullRepo}
                onChange={(event) => setPullRepo(event.target.value)}
                placeholder="repo"
                aria-label="Pull request repo"
              />
              <input
                value={pullNumber}
                onChange={(event) => setPullNumber(event.target.value)}
                placeholder="number"
                inputMode="numeric"
                aria-label="Pull request number"
              />
              <button type="submit" disabled={addLink.isPending}>
                Link
              </button>
            </form>
            {addLink.isError ? (
              <p className="work-page__error">{addLink.error.message}</p>
            ) : null}
          </section>
        </aside>
      </div>

      <section className="work-detail__panel work-detail__comments">
        <h2>Comments</h2>
        <form className="work-detail__comment-form" onSubmit={submitComment}>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            aria-label="Comment body"
          />
          <button type="submit" disabled={addComment.isPending || !comment.trim()}>
            Comment
          </button>
        </form>
        {addComment.isError ? (
          <p className="work-page__error">{addComment.error.message}</p>
        ) : null}
        <div className="work-detail__comment-list">
          {detail.data.comments.length === 0 ? (
            <p className="work-detail__muted">No comments yet.</p>
          ) : (
            detail.data.comments.map((entry) => (
              <article className="work-comment" key={entry.id}>
                <header>
                  <strong>{displayPrincipal(entry.author)}</strong>
                  <time dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
                </header>
                <p>{entry.body}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="work-detail__fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssueFact({ issue }: { issue: WorkItem['issue'] }): JSX.Element {
  const label = issue ? `#${String(issue.number)}` : 'None';
  return (
    <div className="work-detail__fact">
      <span>Issue</span>
      <strong>{issue?.url ? <a href={issue.url}>{label}</a> : label}</strong>
    </div>
  );
}

function emptyEdit(): EditState {
  return {
    title: '',
    body: '',
    status: 'backlog',
    kind: 'task',
    priority: 'p2',
    labels: '',
    assignees: '',
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
