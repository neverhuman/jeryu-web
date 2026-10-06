// One interval for however many readers the page hands the instant to.

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTickingNow } from '../useTickingNow';

function Clock(): JSX.Element {
  return <span data-testid="clock">{useTickingNow()}</span>;
}

describe('useTickingNow', () => {
  afterEach(() => vi.useRealTimers());

  it('moves the instant on every 30 s from a single timer', async () => {
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-09-19T14:00:00Z'),
    });
    const timers = vi.spyOn(globalThis, 'setInterval');
    const view = render(<Clock />);
    const read = (): number => Number(view.getByTestId('clock').textContent);
    expect(read()).toBe(Date.parse('2026-09-19T14:00:00Z'));
    expect(timers).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(read()).toBe(Date.parse('2026-09-19T14:00:30Z'));
    // Still the one timer: the tick repeats, it is not re-armed per render.
    expect(timers).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
