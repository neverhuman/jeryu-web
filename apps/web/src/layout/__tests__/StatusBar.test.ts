import { describe, expect, it } from 'vitest';

import { statusMessage } from '../StatusBar';

describe('statusMessage', () => {
  it('says nothing while live updates work', () => {
    expect(statusMessage('open', null)).toBeNull();
    expect(statusMessage('connecting', null)).toBeNull();
    expect(statusMessage('idle', null)).toBeNull();
  });

  it('speaks up when the page may be stale', () => {
    expect(statusMessage('reconnecting', null)).toMatch(/Reconnecting/);
    expect(statusMessage('closed', null)).toMatch(/out of date/);
    expect(statusMessage('open', 'subscription_denied')).toMatch(/subscription_denied/);
  });
});
