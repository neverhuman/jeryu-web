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
    expect(statusMessage('idle', 'unknown_message')).toMatch(/unknown_message/);
  });

  it('stays quiet about an error while the socket is open', () => {
    expect(statusMessage('open', 'subscription_denied')).toBeNull();
    expect(statusMessage('open', 'unknown_message')).toBeNull();
  });
});
