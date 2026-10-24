// ReadmePanel.tsx — README rendering surface (W-FE-09).
//
// Pulls the rendered Markdown via `useMarkdown(repoId, ref)` and lights up
// the appropriate UX-QA state. A 404 from the README endpoint resolves to
// the empty state ("No README found") because that is the expected outcome
// when a repository has not initialized one, not a real error.

import { FileText } from 'lucide-react';

import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useMarkdown } from '../../hooks/useMarkdown';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../state';

import { MarkdownRenderer } from './MarkdownRenderer';
import { MarkdownSource } from './MarkdownSource';

export interface ReadmePanelProps {
  repoId: string | null;
  ref?: string;
  /** SPA path relative README links resolve against, ending in `/`. */
  linkBase?: string;
  /**
   * A folder (no trailing `/`): show its README, as a folder view does, with
   * its relative images and links resolved from that folder.
   */
  dir?: string;
}

export function ReadmePanel({ repoId, ref, linkBase, dir = '' }: ReadmePanelProps): JSX.Element {
  const query = useMarkdown(repoId, ref, dir);
  const noReadme = dir ? `No README in ${dir}` : 'No README found';
  const noReadmeWhy = dir
    ? 'This folder does not include a README at the selected ref.'
    : 'This repository does not include a README at the selected ref.';

  if (query.isPending) {
    return <LoadingState title="Loading README…" rows={6} />;
  }

  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError) {
      if (err.status === 404 || err.code === 'not_found') {
        return (
          <EmptyState title={noReadme} description={noReadmeWhy} icon={FileText} />
        );
      }
      if (err.status === 403 || err.code === 'permission_denied') {
        return (
          <PermissionDeniedState
            description="You do not have permission to view this README."
            missingPermission="repo.read"
          />
        );
      }
    }
    return (
      <ErrorState
        title="Could not render the README."
        error={query.error}
      />
    );
  }

  const data = query.data;
  if (!data || !data.html) {
    return (
      <EmptyState title={noReadme} description={noReadmeWhy} icon={FileText} />
    );
  }

  // The payload carries the Markdown source beside the server HTML; render the
  // source when present (see MarkdownSource for why).
  const source = (data as { markdown?: unknown }).markdown;
  if (typeof source === 'string' && source.trim() !== '') {
    return (
      <MarkdownSource
        markdown={source}
        linkBase={linkBase}
        docDir={dir}
        imageSrc={
          repoId && ref ? (path) => endpoints.rawPath(repoId, { ref, path }) : undefined
        }
      />
    );
  }
  return <MarkdownRenderer html={data.html} />;
}
