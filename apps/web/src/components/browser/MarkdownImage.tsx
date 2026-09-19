// MarkdownImage.tsx — an image in rendered Markdown that fails politely.
//
// The site's content security policy allows images from this origin only, so a
// badge from another host is blocked, and any image can simply be missing. A
// broken-image icon says nothing; the alt text as a small link to the image
// says what was meant and lets the reader open it.

import { useState, type ImgHTMLAttributes } from 'react';

import { resolveImageSrc } from './markdownImages';

export interface MarkdownImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  /** Directory of the Markdown file inside the repository, ending in `/`. */
  docDir?: string;
  /** Maps a repository path to a URL the browser can load (the raw endpoint). */
  imageSrc?: (repoPath: string) => string;
}

export function MarkdownImage({
  src = '',
  alt = '',
  docDir,
  imageSrc,
  ...rest
}: MarkdownImageProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const resolved = resolveImageSrc(src, docDir, imageSrc);
  if (failed || resolved === '') {
    const label = alt.trim() === '' ? 'image' : alt;
    if (resolved === '') return <span className="markdown-image-chip">{label}</span>;
    return (
      <a
        className="markdown-image-chip"
        href={resolved}
        target="_blank"
        rel="noopener noreferrer"
        title={`Image not shown: ${resolved}`}
      >
        {label}
      </a>
    );
  }
  return <img {...rest} src={resolved} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
