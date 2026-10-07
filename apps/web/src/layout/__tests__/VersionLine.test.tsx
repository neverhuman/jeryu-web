import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { VersionLine, versionLabel, versionTitle } from '../VersionLine';
import type { ServerVersion } from '../../api/types/version';

const server = vi.hoisted((): { data: ServerVersion | undefined } => ({ data: undefined }));
vi.mock('../../hooks/useServerVersion', () => ({
  useServerVersion: () => ({ data: server.data }),
}));

const FULL: ServerVersion = {
  version: '5.0.0',
  name: 'jeryu-api',
  commit: '6f22958a1b2c3d4e5f60718293a4b5c6d7e8f901',
  webCommit: '2d4a869f1e2d3c4b5a69788796a5b4c3d2e1f012',
};

describe('versionLabel', () => {
  it('names the version and the web build behind it', () => {
    expect(versionLabel(FULL)).toBe('jeryu 5.0.0 · web 2d4a869');
  });

  it('says only the version when the build did not know its web commit', () => {
    expect(versionLabel({ ...FULL, webCommit: null })).toBe('jeryu 5.0.0');
  });

  it('shows a commit shorter than seven characters whole', () => {
    expect(versionLabel({ ...FULL, webCommit: '2d4a86' })).toBe('jeryu 5.0.0 · web 2d4a86');
  });
});

describe('versionTitle', () => {
  it('spells out both commits in full', () => {
    expect(versionTitle(FULL)).toBe(
      `jeryu-api 5.0.0\napi commit ${FULL.commit}\nweb commit ${FULL.webCommit}`,
    );
  });

  it('leaves out a commit the build did not know', () => {
    expect(versionTitle({ ...FULL, commit: null, webCommit: null })).toBe('jeryu-api 5.0.0');
  });
});

describe('VersionLine', () => {
  it('shows the running build once the server has answered', () => {
    server.data = FULL;
    render(<VersionLine />);
    expect(screen.getByTestId('version-line')).toHaveTextContent('jeryu 5.0.0 · web 2d4a869');
    expect(screen.getByTestId('version-line')).toHaveAttribute('title', versionTitle(FULL));
  });

  it('stays away while the server has said nothing', () => {
    server.data = undefined;
    const { container } = render(<VersionLine />);
    expect(container).toBeEmptyDOMElement();
  });
});
