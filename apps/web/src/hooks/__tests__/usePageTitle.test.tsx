// usePageTitle.test.tsx — how a page's name becomes the document title.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TITLE_SUFFIX, pageTitle, usePageTitle } from '../usePageTitle';
import { repoPageTitle } from '../../pages/RepoRouter';

function Page({ name }: { name: string | null }): JSX.Element {
  usePageTitle(name);
  return <p>page</p>;
}

describe('pageTitle', () => {
  it('puts the product name last', () => {
    expect(pageTitle('Needs you')).toBe('Needs you · JeRyu');
  });

  it('is the product name alone when the page has no name yet', () => {
    expect(pageTitle(null)).toBe(TITLE_SUFFIX);
    expect(pageTitle('   ')).toBe(TITLE_SUFFIX);
  });
});

describe('usePageTitle', () => {
  it('sets the title while mounted and restores the product name on leaving', () => {
    const view = render(<Page name="Activity" />);
    expect(document.title).toBe('Activity · JeRyu');
    view.rerender(<Page name="Work" />);
    expect(document.title).toBe('Work · JeRyu');
    view.unmount();
    expect(document.title).toBe(TITLE_SUFFIX);
  });
});

describe('repoPageTitle', () => {
  it('names the pull request, the file and the commit a repository URL points at', () => {
    expect(repoPageTitle('acme/widgets', 'pulls', '31')).toBe('acme/widgets#31');
    expect(repoPageTitle('acme/widgets', 'pulls', '')).toBe('acme/widgets · Pull requests');
    expect(repoPageTitle('acme/widgets', 'blob', 'main/src/lib.rs')).toBe(
      'lib.rs · acme/widgets'
    );
    expect(repoPageTitle('acme/widgets', 'commit', 'abcdef1234567890')).toBe(
      'acme/widgets@abcdef1'
    );
    expect(repoPageTitle('acme/widgets', null, '')).toBe('acme/widgets');
  });
});
