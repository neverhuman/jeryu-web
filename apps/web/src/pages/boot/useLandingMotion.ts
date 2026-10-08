import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

type Connection = EventTarget & { readonly saveData?: boolean };
function connection(): Connection | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection;
}
function systemState(): { reduced: boolean; saveData: boolean; visible: boolean } {
  const media = (query: string): boolean => typeof window !== 'undefined' && (window.matchMedia?.(query).matches ?? false);
  return {
    reduced: media('(prefers-reduced-motion: reduce)') || media('(forced-colors: active)') ||
      (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'high-contrast'),
    saveData: connection()?.saveData ?? false,
    visible: typeof document === 'undefined' || !document.hidden,
  };
}

/** Native CSS owns animation; this hook only handles preferences and lifecycle. */
export function useLandingMotion(target: RefObject<HTMLElement | null>, enabled: boolean): {
  active: boolean;
} {
  const [system, setSystem] = useState(systemState);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const refresh = (): void => setSystem(systemState());
    const media = [window.matchMedia?.('(prefers-reduced-motion: reduce)'), window.matchMedia?.('(forced-colors: active)')];
    media.forEach((query) => query?.addEventListener('change', refresh));
    const network = connection();
    network?.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    const theme = new MutationObserver(refresh);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false), { rootMargin: '400px 0px' },
    );
    if (target.current) observer?.observe(target.current);
    return () => {
      media.forEach((query) => query?.removeEventListener('change', refresh));
      network?.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
      theme.disconnect();
      observer?.disconnect();
    };
  }, [target]);
  return { active: enabled && !system.reduced && !system.saveData && system.visible && inView };
}
