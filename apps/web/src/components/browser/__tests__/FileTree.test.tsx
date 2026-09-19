import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorResponse } from '../../../pages/__tests__/shiftPageHelpers';
import { FileTree } from '../FileTree';

function renderTree(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FileTree repoId="repo-1" refName="main" onSelectFile={() => {}} />
    </QueryClientProvider>
  );
}

describe('FileTree', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says a repository has no code here instead of failing, and asks once', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => errorResponse(404, 'no tree'));
    renderTree();
    expect(await screen.findByText(/No code on this forge/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not load/)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('still reports a real failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => errorResponse(500, 'boom'));
    renderTree();
    expect(await screen.findByText('Could not load /.', {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
