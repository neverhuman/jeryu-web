import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiGet, apiSend } from '../api/client';
import { endpoints } from '../api/endpoints';
import type {
  CreateWorkItemRequest,
  WorkItem,
  WorkItemKind,
  WorkItemListResponse,
  WorkPriority,
  WorkStatus,
} from '../api/types';
import { useResolveRepo } from '../hooks/useResolveRepo';
import {
  DEFAULT_WORK_FILTERS,
  WORK_KINDS,
  WORK_KIND_LABELS,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABELS,
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  assigneeOptions,
  csvTokens,
  displayPrincipal,
  filterWorkItems,
  groupWorkItems,
  labelOptions,
  principalsFromInput,
  repoOptions,
  workRepoName,
  type WorkFilters,
} from './workModel';

import './page.css';
import './WorkPage.css';

export interface WorkPageProps {
  provider?: string;
  fullName?: string;
  alias?: 'issues';
}

interface WorkBoardProps {
  title: string;
  subtitle: string;
  queryKey: readonly unknown[];
  queryUrl: string;
  createUrl: string;
  repoScoped: boolean;
}

interface CreateFormState {
  title: string;
  body: string;
  kind: WorkItemKind;
  priority: WorkPriority;
  status: WorkStatus;
  labels: string;
  assignees: string;
}

const DEFAULT_CREATE_FORM: CreateFormState = {
  title: '',
  body: '',
  kind: 'task',
  priority: 'p2',
  status: 'ready',
  labels: '',
  assignees: '',
};

export function WorkPage(props: WorkPageProps = {}): JSX.Element {
  if (props.provider && props.fullName) {
    return <RepoWorkPage {...props} />;
  }
  return (
    <WorkBoard
      title="Work"
      subtitle="Split-wide work tracker for tasks, bugs, chores, docs, and CI follow-up."
      queryKey={['work']}
      queryUrl={endpoints.work()}
      createUrl={endpoints.work()}
      repoScoped={false}
    />
  );
}

function RepoWorkPage({ provider = 'unknown', fullName = '', alias }: WorkPageProps): JSX.Element {
  const resolved = useResolveRepo(provider, fullName);

  if (resolved.isPending) {
    return (
      <div className="page" data-testid="work-page">
        <p className="page__roadmap-note">Resolving repository.</p>
      </div>
    );
  }

  if (resolved.error || !resolved.data) {
    return (
      <div className="page" data-testid="work-page">
        <header className="page__header">
          <h1 className="page__title">Work</h1>
        </header>
        <p className="page__roadmap-note">
          {resolved.error?.message ?? `No repository ${fullName}.`}
        </p>
      </div>
    );
  }

  const repoName = `${resolved.data.summary.id.owner}/${resolved.data.summary.id.name}`;
  const subtitle =
    alias === 'issues'
      ? `${repoName} issue-compatible work items.`
      : `${repoName} work items.`;

  return (
    <WorkBoard
      title="Work"
      subtitle={subtitle}
      queryKey={['repo-work', resolved.data.id]}
      queryUrl={endpoints.repoWork(resolved.data.id)}
      createUrl={endpoints.repoWork(resolved.data.id)}
      repoScoped
    />
  );
}

function WorkBoard({
  title,
  subtitle,
  queryKey,
  queryUrl,
  createUrl,
  repoScoped,
}: WorkBoardProps): JSX.Element {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<WorkFilters>(DEFAULT_WORK_FILTERS);
  const [form, setForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM);

  const work = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet<WorkItemListResponse>(queryUrl, { signal }),
    staleTime: 10_000,
  });

  const create = useMutation({
    mutationFn: (request: CreateWorkItemRequest) =>
      apiSend<WorkItem>(createUrl, request),
    onSuccess: async () => {
      setForm(DEFAULT_CREATE_FORM);
      await queryClient.invalidateQueries({ queryKey });
      if (repoScoped) {
        await queryClient.invalidateQueries({ queryKey: ['work'] });
      }
    },
  });

  const items = work.data?.items ?? [];
  const filtered = useMemo(
    () => filterWorkItems(items, filters),
    [filters, items]
  );
  const lanes = useMemo(() => groupWorkItems(filtered), [filtered]);
  const repos = useMemo(() => repoOptions(items), [items]);
  const labels = useMemo(() => labelOptions(items), [items]);
  const assignees = useMemo(() => assigneeOptions(items), [items]);
  const blocked = filtered.filter((item) => item.status === 'blocked').length;
  const inReview = filtered.filter((item) => item.status === 'in_review').length;

  function submitCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const titleValue = form.title.trim();
    if (!titleValue) return;
    create.mutate({
      repo: null,
      title: titleValue,
      body: form.body.trim() || null,
      status: form.status,
      kind: form.kind,
      priority: form.priority,
      labels: csvTokens(form.labels),
      assignees: principalsFromInput(form.assignees),
    });
  }

  return (
    <div className="page page--full work-page" data-testid="work-page">
      <header className="page__header work-page__header">
        <div>
          <h1 className="page__title">{title}</h1>
          <p className="page__subtitle">{subtitle}</p>
        </div>
        <div className="work-page__summary" aria-label="Work summary">
          <Metric label="shown" value={filtered.length} />
          <Metric label="total" value={work.data?.total ?? items.length} />
          <Metric label="blocked" value={blocked} />
          <Metric label="review" value={inReview} />
        </div>
      </header>

      <section className="work-page__filters" aria-label="Work filters">
        {!repoScoped ? (
          <label>
            Repo
            <select
              value={filters.repo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, repo: event.target.value }))
              }
            >
              <option value="all">All repos</option>
              {repos.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="all">All statuses</option>
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
            value={filters.kind}
            onChange={(event) =>
              setFilters((current) => ({ ...current, kind: event.target.value }))
            }
          >
            <option value="all">All kinds</option>
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
            value={filters.priority}
            onChange={(event) =>
              setFilters((current) => ({ ...current, priority: event.target.value }))
            }
          >
            <option value="all">All priorities</option>
            {WORK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {WORK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select
            value={filters.assignee}
            onChange={(event) =>
              setFilters((current) => ({ ...current, assignee: event.target.value }))
            }
          >
            <option value="all">All assignees</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {displayPrincipal(assignee)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <select
            value={filters.label}
            onChange={(event) =>
              setFilters((current) => ({ ...current, label: event.target.value }))
            }
          >
            <option value="all">All labels</option>
            {labels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="work-page__search">
          Search
          <input
            type="search"
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            aria-label="Search work"
          />
        </label>
      </section>

      <section className="work-page__create" aria-label="Create work item">
        <form className="work-create" onSubmit={submitCreate}>
          <label className="work-create__title">
            Title
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="New work item"
              required
            />
          </label>
          <label>
            Kind
            <select
              value={form.kind}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  kind: event.target.value as WorkItemKind,
                }))
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
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  priority: event.target.value as WorkPriority,
                }))
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
            Status
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as WorkStatus,
                }))
              }
            >
              {WORK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {WORK_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="work-create__body">
            Body
            <textarea
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event.target.value }))
              }
              rows={2}
            />
          </label>
          <label>
            Labels
            <input
              value={form.labels}
              onChange={(event) =>
                setForm((current) => ({ ...current, labels: event.target.value }))
              }
              placeholder="comma,separated"
            />
          </label>
          <label>
            Assignees
            <input
              value={form.assignees}
              onChange={(event) =>
                setForm((current) => ({ ...current, assignees: event.target.value }))
              }
              placeholder="alice,agent:runner"
            />
          </label>
          <button
            type="submit"
            className="work-create__submit"
            disabled={create.isPending || !form.title.trim()}
          >
            Create
          </button>
        </form>
        {create.isError ? (
          <p className="work-page__error">{create.error.message}</p>
        ) : null}
      </section>

      {work.isPending ? (
        <p className="page__roadmap-note">Loading work.</p>
      ) : work.isError ? (
        <p className="page__roadmap-note">{work.error.message}</p>
      ) : filtered.length === 0 ? (
        <p className="page__roadmap-note">No work items match the current filters.</p>
      ) : (
        <section className="work-lanes" aria-label="Work board">
          {lanes.map((lane) => (
            <div className="work-lane" key={lane.id}>
              <header className="work-lane__header">
                <h2>{lane.title}</h2>
                <span className="work-lane__count">{lane.items.length}</span>
              </header>
              <div className="work-lane__items">
                {lane.items.map((item) => (
                  <WorkCard item={item} key={item.id} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function WorkCard({ item }: { item: WorkItem }): JSX.Element {
  return (
    <article className={`work-card work-card--${item.priority}`}>
      <div className="work-card__top">
        <span className="work-card__key">{item.key}</span>
        <span className="work-card__priority">{WORK_PRIORITY_LABELS[item.priority]}</span>
      </div>
      <h3 className="work-card__title">
        <Link to={`/work/${encodeURIComponent(item.key)}`}>{item.title}</Link>
      </h3>
      <div className="work-card__meta">
        <span>{WORK_KIND_LABELS[item.kind]}</span>
        <span>{workRepoName(item)}</span>
      </div>
      <div className="work-card__chips" aria-label={`${item.key} labels`}>
        {item.labels.map((label) => (
          <span className="work-chip" key={label}>
            {label}
          </span>
        ))}
        {item.assignees.map((assignee) => (
          <span className="work-chip work-chip--person" key={assignee.id}>
            {displayPrincipal(assignee)}
          </span>
        ))}
      </div>
      <div className="work-card__links">
        {item.issue ? (
          item.issue.url ? (
            <a href={item.issue.url}>#{String(item.issue.number)}</a>
          ) : (
            <span>#{String(item.issue.number)}</span>
          )
        ) : null}
        {item.pull_requests.map((pull) => (
          pull.url ? (
            <a
              href={pull.url}
              key={`${pull.owner}/${pull.repo}/${String(pull.number)}`}
            >
              PR {String(pull.number)}
            </a>
          ) : (
            <span key={`${pull.owner}/${pull.repo}/${String(pull.number)}`}>
              PR {String(pull.number)}
            </span>
          )
        ))}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="work-page__metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
