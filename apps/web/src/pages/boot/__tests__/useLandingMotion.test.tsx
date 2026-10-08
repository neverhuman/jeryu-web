import { act, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLandingMotion } from '../useLandingMotion';

let reduced: boolean;
let hidden: boolean;
let saveData: boolean;
let observerCallback: IntersectionObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;
let preference: EventTarget;
let network: EventTarget;

beforeEach(() => {
  reduced = false; hidden = false; saveData = false;
  preference = new EventTarget(); network = new EventTarget(); disconnect = vi.fn();
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query === '(prefers-reduced-motion: reduce)' && reduced; },
    addEventListener: preference.addEventListener.bind(preference),
    removeEventListener: preference.removeEventListener.bind(preference),
  }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { observerCallback = callback; }
    observe = vi.fn(); disconnect = disconnect;
  });
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  Object.defineProperty(network, 'saveData', { get: () => saveData });
  Object.defineProperty(navigator, 'connection', { configurable: true, value: network });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'connection');
});

function useMotion(enabled = true): ReturnType<typeof useLandingMotion> {
  const ref = useRef<HTMLElement>(document.createElement('section'));
  return useLandingMotion(ref, enabled);
}

describe('landing motion lifecycle', () => {
  it('runs automatically and respects its lifecycle enablement', () => {
    const { result, rerender } = renderHook(({ enabled }) => useMotion(enabled), { initialProps: { enabled: true } });
    expect(result.current.active).toBe(true);
    rerender({ enabled: false });
    expect(result.current.active).toBe(false);
    rerender({ enabled: true });
    expect(result.current.active).toBe(true);
  });
  it('reacts to system reduced-motion preferences and resumes automatically', () => {
    const { result } = renderHook(() => useMotion());
    act(() => { reduced = true; preference.dispatchEvent(new Event('change')); });
    expect(result.current.active).toBe(false);
    act(() => { reduced = false; preference.dispatchEvent(new Event('change')); });
    expect(result.current.active).toBe(true);
  });
  it('stops outside the scene or in a hidden tab and releases its observer', () => {
    const { result, unmount } = renderHook(() => useMotion());
    act(() => observerCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(result.current.active).toBe(false);
    act(() => observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(result.current.active).toBe(true);
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.active).toBe(false);
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.active).toBe(true);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it('respects data saving without storing a preference or starting a timer', () => {
    const { result } = renderHook(() => useMotion());
    act(() => { saveData = true; network.dispatchEvent(new Event('change')); });
    expect(result.current.active).toBe(false);
  });
});
