import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVENTORY } from '../../test/fixtures/delivery';
import { json, renderAt } from '../__tests__/shiftPageHelpers';
import { BuildsPanel } from './BuildsPanel';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('build inventory', () => {
  it('keeps the default scan small, opens image details and makes earlier history available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(INVENTORY));
    renderAt('/releases?tab=builds', '/releases', <BuildsPanel family="acme" />);
    await screen.findByText('rc-21', { selector: 'strong' });
    expect(screen.queryByText('rc-16', { selector: 'strong' })).toBeNull();
    expect(screen.getByText('failed', { selector: 'summary span' })).toBeVisible();
    const prod = screen.getByText('rc-18', { selector: 'strong' }).closest('details') as HTMLDetailsElement;
    fireEvent.click(prod.querySelector('summary') as HTMLElement);
    prod.open = true; fireEvent(prod, new Event('toggle'));
    await waitFor(() => expect(screen.getByText('production · app-01')).toBeVisible());
    expect(screen.getByText('staging · stage-01')).toBeVisible();
    expect(screen.getByText(/image\.example\/acme\/cloud-app@sha256:/)).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Older history' }));
    expect(screen.getByText('rc-16', { selector: 'strong' })).toBeVisible();
  });
  it('shows missing data and read failures explicitly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...INVENTORY, total: 0, builds: [] }));
    renderAt('/releases', '/releases', <BuildsPanel family="acme" />);
    expect(await screen.findByText('No builds reported yet')).toBeVisible();
  });
});
