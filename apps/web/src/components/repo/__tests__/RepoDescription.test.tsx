import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RepoDescription } from '../RepoDescription';

describe('RepoDescription', () => {
  it('preserves surrounding text and links each mirror with a window indicator', () => {
    const { container } = render(<RepoDescription text="Tools (GitHub mirror: neverhuman/jankurai-auditor) and (GitHub mirror: acme/other.repo)" />);
    expect(container).toHaveTextContent('Tools (GitHub mirror: neverhuman/jankurai-auditor) and (GitHub mirror: acme/other.repo)');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'https://github.com/neverhuman/jankurai-auditor');
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAccessibleName(/opens in a new window/);
      expect(link.querySelector('svg')).not.toBeNull();
    }
  });

  it.each(['Plain description', '(GitHub mirror: javascript:alert(1))', '(GitHub mirror: acme/repo/../../other)', '(GitHub mirror: acme/repo?redirect=evil)'])('keeps other descriptions as text: %s', (text) => {
    const { container } = render(<RepoDescription text={text} />);
    expect(container.textContent).toBe(text);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
