import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { MarkdownRenderer } from '../MarkdownRenderer';
import { MarkdownSource } from '../MarkdownSource';
import { dirOf, repoImagePath, resolveImageSrc } from '../markdownImages';

const raw = (path: string): string => `/api/v1/repos/repo-1/raw?ref=main&path=${encodeURIComponent(path)}`;

describe('markdownImages', () => {
  it('finds the repository path a relative image names, and leaves the rest alone', () => {
    expect(repoImagePath('docs/logo.png')).toBe('docs/logo.png');
    expect(repoImagePath('./logo.png', 'docs/')).toBe('docs/logo.png');
    expect(repoImagePath('../img/a%20b.png', 'docs/guide')).toBe('docs/img/a b.png');
    expect(repoImagePath('https://img.shields.io/badge/x.svg')).toBeNull();
    expect(repoImagePath('//cdn.example/x.png')).toBeNull();
    expect(repoImagePath('data:image/png;base64,AAAA')).toBeNull();
    expect(repoImagePath('/favicon.svg')).toBeNull();
    expect(repoImagePath('')).toBeNull();
    expect(dirOf('docs/guide/a.md')).toBe('docs/guide/');
    expect(dirOf('README.md')).toBe('');
  });

  it('sends relative images to the raw endpoint and external ones as written', () => {
    expect(resolveImageSrc('docs/logo.png', '', raw)).toBe(raw('docs/logo.png'));
    expect(resolveImageSrc('https://img.shields.io/x.svg', '', raw)).toBe('https://img.shields.io/x.svg');
    expect(resolveImageSrc('docs/logo.png', '', undefined)).toBe('docs/logo.png');
  });
});

describe('Markdown images', () => {
  const README = [
    '[![CI](https://img.shields.io/badge/ci-green.svg)](docs/testing.md)',
    '',
    '<img alt="Jankurai" src="https://img.shields.io/badge/jankurai-audit-blue.svg">',
    '',
    '![Diagram](docs/diagram.png)',
    '',
    '<!-- a review marker that is not for readers -->',
  ].join('\n');

  function renderSource(): void {
    render(
      <MemoryRouter>
        <MarkdownSource markdown={README} linkBase="/repos/jeryu/root/r/blob/main/" imageSrc={raw} />
      </MemoryRouter>
    );
  }

  it('renders an <img> written as HTML, and resolves a relative image to the raw endpoint', () => {
    renderSource();
    expect(screen.getByRole('img', { name: 'Jankurai' })).toHaveAttribute(
      'src',
      'https://img.shields.io/badge/jankurai-audit-blue.svg'
    );
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute('src', raw('docs/diagram.png'));
    // HTML comments are not shown as text.
    expect(screen.queryByText(/review marker/)).toBeNull();
  });

  it('replaces a blocked or missing image with its alt text as a link, never a broken icon', () => {
    renderSource();
    fireEvent.error(screen.getByRole('img', { name: 'Jankurai' }));
    expect(screen.queryByRole('img', { name: 'Jankurai' })).toBeNull();
    const chip = screen.getByRole('link', { name: 'Jankurai' });
    expect(chip).toHaveAttribute('href', 'https://img.shields.io/badge/jankurai-audit-blue.svg');
    expect(chip).toHaveAttribute('target', '_blank');
    expect(chip).toHaveAttribute('rel', 'noopener noreferrer');
    // The other images are untouched.
    expect(screen.getByRole('img', { name: 'Diagram' })).toBeInTheDocument();
  });

  it('does the same for server-rendered HTML', () => {
    render(
      <MemoryRouter>
        <MarkdownRenderer html='<p><img alt="Badge" src="https://img.shields.io/x.svg"></p>' />
      </MemoryRouter>
    );
    fireEvent.error(screen.getByRole('img', { name: 'Badge' }));
    expect(screen.getByRole('link', { name: 'Badge' })).toHaveAttribute('href', 'https://img.shields.io/x.svg');
  });
});
