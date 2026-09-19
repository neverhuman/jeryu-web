// RepoFileContent.tsx — one file at one ref: Raw / Download / Copy permalink
// and the viewer. The main column of the repository page when a file is open.

import { Check, Copy, Download, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { ActionButton } from '../components/action/ActionButton';
import { CodeViewer } from '../components/browser';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
} from '../components/state';
import { useBlob } from '../hooks/useBlob';

import { blobPath } from './repoBrowserModel';

export interface RepoFileContentProps {
  provider: string;
  fullName: string;
  repoId: string;
  refName: string;
  path: string;
}

export function RepoFileContent({
  provider,
  fullName,
  repoId,
  refName,
  path,
}: RepoFileContentProps): JSX.Element {
  const blob = useBlob(repoId, refName, path);
  const [copied, setCopied] = useState(false);

  if (!path) {
    return (
      <EmptyState title="No file selected" description="Open a file from the Files panel." />
    );
  }
  if (blob.isPending) {
    return <LoadingState title={`Loading ${path}…`} variant="message" />;
  }
  if (blob.error) {
    if (blob.error instanceof ApiError && blob.error.status === 403) {
      return (
        <PermissionDeniedState
          description="You do not have permission to view this file."
          missingPermission="repo.read"
        />
      );
    }
    return <ErrorState title="Could not load the file." error={blob.error} />;
  }
  if (!blob.data) {
    return (
      <EmptyState title="File is empty" description="The file at this ref has no content." />
    );
  }

  const rawUrl = endpoints.raw(repoId, { ref: refName, path });
  const permalink = `${window.location.origin}${blobPath(provider, fullName, blob.data.sha, path)}`;
  const dir = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/'))}/` : '';

  const copyPermalink = (): void => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard.writeText(permalink).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false)
    );
  };

  return (
    <>
      <div className="code-browser-layout__top">
        <a href={rawUrl} target="_blank" rel="noopener noreferrer" aria-label="View raw file">
          <ActionButton variant="default" icon={<ExternalLink size={12} aria-hidden="true" />}>
            Raw
          </ActionButton>
        </a>
        <a href={rawUrl} download={path.split('/').pop() ?? path} aria-label="Download file">
          <ActionButton variant="default" icon={<Download size={12} aria-hidden="true" />}>
            Download
          </ActionButton>
        </a>
        <ActionButton
          variant="default"
          onClick={copyPermalink}
          aria-label="Copy permalink"
          icon={
            copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />
          }
        >
          {copied ? 'Copied' : 'Copy permalink'}
        </ActionButton>
      </div>
      <CodeViewer
        path={path}
        text={blob.data.text}
        renderedHtml={blob.data.rendered_markdown?.html ?? null}
        mime={blob.data.mime}
        isBinary={blob.data.is_binary}
        linkBase={`${blobPath(provider, fullName, refName, dir)}`}
        imageSrc={(imagePath) => endpoints.raw(repoId, { ref: refName, path: imagePath })}
      />
    </>
  );
}
