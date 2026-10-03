// WikiPage.tsx — the instance's internal wiki (`/wiki/<page path>`).
//
// An administrator picks one repository as the wiki in Settings. This page is
// not a code browser: it reads only the wiki's start page (`index.md` at the
// top of the repository, else `wiki/README.md`) and the Markdown under
// `wiki/`, as documents: the pages in a folder tree on the left, the page in
// the middle, and beside each section a short note saying when it was last
// changed, by whom and in which commit, and how long its oldest line has been
// there (from `git blame`). The whole repository stays one click away, and a
// wiki without a start page or pages says what to add.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, ExternalLink, FilePlus2, FileText, Folder, GitCommitHorizontal } from 'lucide-react';

import { endpoints } from '../../api/endpoints';
import type { BlameResponse, WikiRepository } from '../../api/types/wiki';
import { MarkdownSource } from '../../components/browser/MarkdownSource';
import { toneClass } from '../../components/tone/tone';
import { When } from '../../format/When';
import { dateText } from '../../format/when';
import { EmptyState, ErrorState, LoadingState } from '../../components/state';
import { useAuth } from '../../hooks/useAuth';
import { useBlob } from '../../hooks/useBlob';
import { useRepositories } from '../../hooks/useRepositories';
import { useSiteSettings } from '../../hooks/useSiteSettings';
import { useBlame, usePageHistory, useWikiPages } from '../../hooks/useWiki';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';
import { blobPath, repoFrontPath } from '../repoBrowserModel';
import { commitPath } from '../repoCommitsModel';
import {
  buildPageTree,
  folderLabel,
  HOME_CANDIDATES,
  linkWikiReferences,
  pageLabel,
  pageTitle,
  resolveDocLink,
  resolvePagePath,
  sectionNote,
  splitFrontmatter,
  splitSections,
  wikiHref,
  wikiScope,
  WIKI_DIR,
  WIKI_PATH,
  type TreeFolder,
  type WikiScope,
} from './wikiModel';

import {
  classifySource,
  fieldValue,
  HEADER_FIELDS,
  parseSourceList,
  statusTone,
  type WikiSource,
} from './wikiSources';
import { usePageTitle } from '../../hooks/usePageTitle';

import '../page.css';
import './WikiPage.css';

const NOTES_KEY = 'jeryu.wiki.notes.v1';

export function WikiPage(): JSX.Element {
  usePageTitle('Wiki');
  const settings = useSiteSettings();
  const { user } = useAuth();
  const wiki = settings.data?.internal_wiki ?? null;

  if (settings.isPending) {
    return <LoadingState title="Loading the wiki…" variant="message" />;
  }
  if (!wiki) {
    return (
      <div className="page" data-testid="wiki-page">
        <EmptyState
          icon={BookOpen}
          title="No wiki has been set up"
          description={
            user?.role === 'admin'
              ? 'Choose the repository that holds the wiki in Settings.'
              : 'An administrator can choose the repository that holds the wiki.'
          }
          action={
            user?.role === 'admin' ? <Link to="/settings#internal-wiki">Open Settings</Link> : undefined
          }
        />
      </div>
    );
  }
  return <WikiReader wiki={wiki} />;
}

function WikiReader({ wiki }: { wiki: WikiRepository }): JSX.Element {
  const splat = decodeURIComponent(useParams()['*'] ?? '');
  const ref = wiki.default_branch;
  const listing = useWikiPages(wiki.id, ref);
  const scope = wikiScope((listing.data?.pages ?? []).map((page) => page.path));
  const path = listing.data ? resolvePagePath(splat, scope) : null;
  const repoHome = repoFrontPath(wiki.host, wiki.full_name);

  return (
    <div className="wiki" data-testid="wiki-page">
      <aside className="wiki__nav" aria-label="Wiki pages">
        <Link to={WIKI_PATH} className="wiki__brand">
          <BookOpen aria-hidden="true" size={16} />
          Wiki
        </Link>
        <Link to={repoHome} className="wiki__repo-link" data-testid="wiki-repo-link">
          {wiki.full_name}
          <ExternalLink aria-hidden="true" size={12} />
        </Link>
        {listing.isPending ? (
          <LoadingState title="Loading pages…" variant="message" />
        ) : listing.error ? (
          <ErrorState title="Could not list the wiki's pages" error={listing.error} />
        ) : (
          <>
            {scope.home && scope.home !== 'wiki/README.md' ? (
              <ul className="wiki-tree">
                <li>
                  <PageLink page={scope.home} scope={scope} current={path} />
                </li>
              </ul>
            ) : null}
            {scope.pages.length > 0 ? (
              <PageTree folder={buildPageTree(scope.pages)} scope={scope} current={path} />
            ) : (
              <p className="wiki__hint" data-testid="wiki-no-folder">
                No pages in <code>{WIKI_DIR}</code> yet. Add Markdown files to that folder of{' '}
                <Link to={repoHome}>{wiki.full_name}</Link> and they are listed here.
              </p>
            )}
          </>
        )}
      </aside>
      <div className="wiki__main">
        {listing.isPending || listing.error ? null : path ? (
          <WikiDocument wiki={wiki} gitRef={ref} path={path} scope={scope} />
        ) : splat === '' ? (
          <StartInvitation wiki={wiki} scope={scope} />
        ) : (
          <EmptyState
            icon={FileText}
            title="No page here"
            description={`The wiki has no page at ${WIKI_DIR}${splat}.`}
            action={
              <Link to={blobPath(wiki.host, wiki.full_name, ref, `${WIKI_DIR}${splat}`)}>
                Look for it in the repository
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}

/** A wiki with no start page: say which files to add, and where. */
function StartInvitation({ wiki, scope }: { wiki: WikiRepository; scope: WikiScope }): JSX.Element {
  const noFolder = scope.pages.length === 0;
  return (
    <section className="wiki-invite" aria-labelledby="wiki-invite-title" data-testid="wiki-invite">
      <FilePlus2 aria-hidden="true" size={22} />
      <h1 className="wiki-invite__title" id="wiki-invite-title">
        Start the wiki
      </h1>
      <p>
        The wiki opens on <code>{HOME_CANDIDATES[0]}</code> at the top of {wiki.full_name}, or on{' '}
        <code>{HOME_CANDIDATES[1]}</code> when there is no {HOME_CANDIDATES[0]}. Its pages are the
        Markdown files in the <code>{WIKI_DIR}</code> folder
        {noFolder ? ', which does not exist yet' : ''}.
      </p>
      <p>Add them in a clone of the repository and push to {wiki.default_branch}:</p>
      <pre className="wiki-invite__steps">
        <code>
          {[
            noFolder ? `mkdir ${WIKI_DIR.slice(0, -1)}` : null,
            `printf '# Wiki\\n\\nWhat this wiki is for.\\n' > ${HOME_CANDIDATES[0]}`,
            noFolder ? `printf '# First page\\n' > ${WIKI_DIR}first-page.md` : null,
            `git add ${noFolder ? `${HOME_CANDIDATES[0]} ${WIKI_DIR}` : HOME_CANDIDATES[0]}`,
            "git commit -m 'wiki: start page'",
            `git push origin ${wiki.default_branch}`,
          ]
            .filter(Boolean)
            .join('\n')}
        </code>
      </pre>
      <Link to={repoFrontPath(wiki.host, wiki.full_name)}>Open {wiki.full_name}</Link>
    </section>
  );
}

function PageLink({
  page,
  scope,
  current,
}: {
  page: string;
  scope: WikiScope;
  current: string | null;
}): JSX.Element {
  return (
    <Link
      to={wikiHref(page, scope)}
      className={`wiki-tree__page${page === current ? ' is-active' : ''}`}
      aria-current={page === current ? 'page' : undefined}
    >
      {pageLabel(page, scope)}
    </Link>
  );
}

function PageTree({
  folder,
  scope,
  current,
}: {
  folder: TreeFolder;
  scope: WikiScope;
  current: string | null;
}): JSX.Element {
  return (
    <ul className="wiki-tree">
      {folder.pages.map((page) => (
        <li key={page}>
          <PageLink page={page} scope={scope} current={current} />
        </li>
      ))}
      {folder.folders.map((child) => (
        <li key={child.path}>
          <details open={current === null || current.startsWith(`${child.path}/`) || undefined}>
            <summary className="wiki-tree__folder">
              <Folder aria-hidden="true" size={14} />
              {folderLabel(child.name)}
            </summary>
            <PageTree folder={child} scope={scope} current={current} />
          </details>
        </li>
      ))}
    </ul>
  );
}

interface WikiDocumentProps {
  wiki: WikiRepository;
  gitRef: string;
  path: string;
  scope: WikiScope;
}

function WikiDocument({ wiki, gitRef, path, scope }: WikiDocumentProps): JSX.Element {
  const blob = useBlob(wiki.id, gitRef, path);
  const blame = useBlame(wiki.id, gitRef, path);
  const history = usePageHistory(wiki.id, gitRef, path);
  const [notesOn, setNotesOn] = useState(() => readBrowserText('durable', NOTES_KEY) !== 'off');
  const toggleNotes = (): void => {
    setNotesOn(!notesOn);
    writeBrowserText('durable', NOTES_KEY, notesOn ? 'off' : 'on');
  };

  if (blob.isPending) return <LoadingState title="Loading the page…" variant="message" />;
  if (blob.error) return <ErrorState title="Could not load this page" error={blob.error} />;

  const page = splitFrontmatter(blob.data.text ?? '');
  const title = pageTitle(path, page);
  const sections = splitSections(linkWikiReferences(page.body, scope), page.offset);
  const bodyHasTitle = /^#\s/.test(page.body.trimStart());
  const docDir = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/'))}/` : '';
  // Folders inside `wiki/`, for the breadcrumb (the start page has none).
  const folders = path.startsWith(WIKI_DIR) ? path.slice(WIKI_DIR.length).split('/').slice(0, -1) : [];
  const resolveHref = (href: string): string =>
    resolveDocLink(href, path, scope, (repoPath) =>
      blobPath(wiki.host, wiki.full_name, gitRef, repoPath)
    );
  const commitHref = (sha: string): string =>
    commitPath(wiki.host, wiki.full_name, sha);
  // Title, summary, status, date and sources have their own places; anything
  // else in the frontmatter shows as a field chip.
  const fields = page.fields.filter(([key]) => !HEADER_FIELDS.includes(key.toLowerCase()));
  const summary = fieldValue(page.fields, 'summary');
  const status = fieldValue(page.fields, 'status');
  const updated = fieldValue(page.fields, 'updated');
  const sourcesValue = fieldValue(page.fields, 'sources');
  const sources = sourcesValue ? parseSourceList(sourcesValue).map(classifySource) : [];
  const newest = history.data?.newest ?? null;
  const oldest = history.data?.oldest ?? null;

  return (
    <article className={`wiki-doc${notesOn ? ' wiki-doc--notes' : ''}`} aria-label={title}>
      <header className="wiki-doc__header">
        <div className="wiki-doc__top">
          {folders.length > 0 ? (
            <nav className="wiki-doc__crumbs" aria-label="Folder">
              <Link to={WIKI_PATH}>Wiki</Link>
              {folders.map((folder, index) => (
                <span key={folder}>
                  {' / '}
                  <Link to={`${WIKI_PATH}/${folders.slice(0, index + 1).map(encodeURIComponent).join('/')}`}>
                    {folder}
                  </Link>
                </span>
              ))}
            </nav>
          ) : (
            <span />
          )}
          {updated || status ? (
            <div className="wiki-doc__badges" data-testid="wiki-page-badges">
              {updated ? (
                <time className="wiki-doc__date" dateTime={updated}>
                  {dateText(updated)}
                </time>
              ) : null}
              {status ? (
                <span className={`page__pill ${toneClass('wiki-doc__status', statusTone(status))}`}>
                  {status}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {bodyHasTitle ? null : <h1 className="wiki-doc__title">{title}</h1>}
        <p className="wiki-doc__meta" data-testid="wiki-page-meta">
          {newest ? (
            <>
              Updated <When at={newest.committed_at} />{' '}
              by {newest.author}
              {history.data && history.data.revisions > 1
                ? ` · ${history.data.revisions} revisions`
                : null}
              {oldest && oldest.sha !== newest.sha ? (
                <>
                  {' · '}created <time dateTime={oldest.committed_at}>{dateText(oldest.committed_at)}</time> by{' '}
                  {oldest.author}
                </>
              ) : null}
              {' · '}
            </>
          ) : null}
          <Link to={blobPath(wiki.host, wiki.full_name, gitRef, path)}>View source</Link>
          {' · '}
          <button
            type="button"
            className="wiki-doc__toggle"
            aria-pressed={notesOn}
            onClick={toggleNotes}
          >
            {notesOn ? 'Hide change notes' : 'Show change notes'}
          </button>
        </p>
        {summary ? <p className="wiki-doc__summary">{summary}</p> : null}
        {fields.length > 0 ? (
          <dl className="wiki-doc__fields">
            {fields.map(([key, value]) => (
              <div key={key} className="wiki-doc__field">
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      {sections.map((section) => (
        <section
          key={section.startLine}
          className="wiki-doc__section"
          data-lines={`${section.startLine}-${section.endLine}`}
        >
          <div className="wiki-doc__body">
            <MarkdownSource
              markdown={section.markdown}
              resolveHref={resolveHref}
              docDir={docDir}
              imageSrc={(repoPath) => endpoints.raw(wiki.id, { ref: gitRef, path: repoPath })}
            />
          </div>
          {notesOn ? (
            <SectionMargin
              blame={blame.data}
              startLine={section.startLine}
              endLine={section.endLine}
              commitHref={commitHref}
            />
          ) : null}
        </section>
      ))}
      {sources.length > 0 ? (
        <SourceList sources={sources} wiki={wiki} gitRef={gitRef} scope={scope} />
      ) : null}
    </article>
  );
}

interface SourceListProps {
  sources: WikiSource[];
  wiki: WikiRepository;
  gitRef: string;
  scope: WikiScope;
}

/** The page's frontmatter sources, each linked to the file it names when it names one. */
function SourceList({ sources, wiki, gitRef, scope }: SourceListProps): JSX.Element {
  // Another repository is named by its bare name; it links when exactly one
  // repository the viewer can see has that name.
  const needsRepos = sources.some((source) => source.target?.kind === 'repo');
  const repos = useRepositories({}, { enabled: needsRepos });
  const hrefOf = (source: WikiSource): string | null => {
    const target = source.target;
    if (!target) return null;
    if (target.kind === 'wiki-repo') {
      return resolveDocLink(target.path, '', scope, (repoPath) =>
        blobPath(wiki.host, wiki.full_name, gitRef, repoPath)
      );
    }
    const matches = (repos.data?.repositories ?? []).filter((repo) => repo.id.name === target.repo);
    if (matches.length !== 1) return null;
    const repo = matches[0];
    const fullName = `${repo.id.owner}/${repo.id.name}`;
    if (!target.path) return repoFrontPath(repo.id.host, fullName);
    if (target.path.endsWith('/')) {
      return `${repoFrontPath(repo.id.host, fullName)}/tree/${encodeURIComponent(repo.default_branch)}/${target.path.slice(0, -1)}`;
    }
    return blobPath(repo.id.host, fullName, repo.default_branch, target.path);
  };
  return (
    <section className="wiki-doc__sources" aria-labelledby="wiki-sources-title">
      <h2 className="wiki-doc__sources-title" id="wiki-sources-title">
        Sources
      </h2>
      <ul>
        {sources.map((source) => {
          const href = hrefOf(source);
          return (
            <li key={source.text}>
              {href ? <Link to={href}>{source.text}</Link> : <span>{source.text}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface SectionMarginProps {
  blame: BlameResponse | undefined;
  startLine: number;
  endLine: number;
  commitHref: (sha: string) => string;
}

/** The note beside one section: newest change, and since when it has been there. */
function SectionMargin({ blame, startLine, endLine, commitHref }: SectionMarginProps): JSX.Element {
  const note = blame ? sectionNote(blame, startLine, endLine) : null;
  if (!note) return <aside className="wiki-note wiki-note--empty" aria-hidden="true" />;
  const { latest, earliest, commitCount } = note;
  return (
    <aside className="wiki-note" aria-label={`Changes to lines ${startLine} to ${endLine}`}>
      <Link to={commitHref(latest.sha)} className="wiki-note__commit" title={latest.summary}>
        <GitCommitHorizontal aria-hidden="true" size={12} />
        {latest.summary || latest.sha.slice(0, 7)}
      </Link>
      <span className="wiki-note__who">
        {latest.author},{' '}
        <time dateTime={latest.authored_at} title={latest.authored_at}>
          <When at={latest.authored_at} />
        </time>
      </span>
      {commitCount > 1 ? (
        <span className="wiki-note__since">
          since{' '}
          <Link to={commitHref(earliest.sha)} title={earliest.summary}>
            {dateText(earliest.authored_at)}
          </Link>{' '}
          · {commitCount} commits
        </span>
      ) : null}
    </aside>
  );
}
