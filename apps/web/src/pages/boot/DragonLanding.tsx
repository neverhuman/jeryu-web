// DragonLanding.tsx — signed-out ink dragon.
//
// One poster paints first. Layer plates load after that, and only when motion
// is allowed. Pointer tilt runs while the pointer is inside the frame, then
// requestAnimationFrame stops. No WebGL, no worker, no extra dependency.

import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { readBrowserText, writeBrowserText } from '../../storage/browserStorage';

import darkPoster from './landing/hero-dark-768.webp';
import lightPoster from './landing/hero-light-768.webp';
import characterPlate from './landing/dragon-transparent-512.webp';
import layerBody from './landing/layer-body-640.webp';
import layerEnergy from './landing/layer-energy-640.webp';
import layerPearl from './landing/layer-pearl-640.webp';
import layerClaw from './landing/layer-claw-640.webp';
import layerHead from './landing/layer-head-640.webp';

import './DragonLanding.css';

const ENTERED_KEY = 'jeryu.landing.dragon.entered';
const NARROW_QUERY = '(max-width: 699px)';
const HEAD_TAU_S = 0.12;
const BODY_TAU_S = 0.22;
const YAW_DEG = 9;
const PITCH_DEG = 4;
const ENTRANCE_MS = 1400;

const LAYERS = [
  { src: layerBody, className: 'dragon-landing__layer' },
  { src: layerEnergy, className: 'dragon-landing__layer' },
  { src: layerPearl, className: 'dragon-landing__layer dragon-landing__pearl' },
  { src: layerClaw, className: 'dragon-landing__layer' },
  { src: layerHead, className: 'dragon-landing__layer dragon-landing__head' },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mediaMatches(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

function connectionBlocksMotion(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g';
}

function themeBlocksMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-theme') === 'high-contrast') return true;
  return mediaMatches('(forced-colors: active)');
}

function readLightPoster(): boolean {
  if (typeof document === 'undefined') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'light') return true;
  if (theme === 'dark' || theme === 'high-contrast') return false;
  return mediaMatches('(prefers-color-scheme: light)');
}

function useLightPoster(): boolean {
  const [light, setLight] = useState(readLightPoster);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => setLight(readLightPoster());
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const scheme = window.matchMedia?.('(prefers-color-scheme: light)');
    scheme?.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      scheme?.removeEventListener('change', apply);
    };
  }, []);

  return light;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => mediaMatches(NARROW_QUERY));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    const apply = (): void => setNarrow(query.matches);
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return narrow;
}

/** True when this visit should play the 1400 ms entrance. A blocked store skips the memory. */
function takeEntrance(): boolean {
  if (readBrowserText('tab', ENTERED_KEY) === '1') return false;
  return writeBrowserText('tab', ENTERED_KEY, '1');
}

export function DragonLanding(): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const narrow = useNarrow();
  const light = useLightPoster();
  const [asked, setAsked] = useState(false);
  const [plateOnly, setPlateOnly] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLImageElement>(null);
  const pearlRef = useRef<HTMLImageElement>(null);

  const motionOk = !reduced && !connectionBlocksMotion() && !themeBlocksMotion();
  const layersOn = motionOk && !plateOnly && (!narrow || asked);

  useEffect(() => {
    if (!layersOn) return;
    const frame = frameRef.current;
    const scene = sceneRef.current;
    const head = headRef.current;
    const pearl = pearlRef.current;
    if (!frame || !scene || !head || !pearl) return;

    let raf = 0;
    let previous = 0;
    let stopped = false;
    let inView = true;
    let x = 0;
    let y = 0;
    let headX = 0;
    let headY = 0;
    let targetX = 0;
    let targetY = 0;
    let entranceStart: number | null = takeEntrance() ? -1 : null;

    const paint = (pulse: number): void => {
      scene.style.transform = `rotateX(${(-y * PITCH_DEG).toFixed(3)}deg) rotateY(${(x * YAW_DEG).toFixed(3)}deg)`;
      head.style.transform = `translateY(${(-pulse + headY * 0.6).toFixed(3)}%) rotate(${(headX * 1.8 - pulse * 1.2).toFixed(3)}deg)`;
      pearl.style.transform = `scale(${(1 + pulse * 0.045).toFixed(4)})`;
    };

    const cancel = (): void => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      previous = 0;
    };

    const step = (time: number): void => {
      raf = 0;
      if (stopped || !inView || document.hidden) {
        cancel();
        return;
      }
      const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 1 / 60;
      previous = time;
      const bodyBlend = 1 - Math.exp(-dt / BODY_TAU_S);
      const headBlend = 1 - Math.exp(-dt / HEAD_TAU_S);
      x += (targetX - x) * bodyBlend;
      y += (targetY - y) * bodyBlend;
      headX += (targetX - headX) * headBlend;
      headY += (targetY - headY) * headBlend;
      let pulse = 0;
      if (entranceStart !== null) {
        if (entranceStart === -1) entranceStart = time;
        const t = clamp((time - entranceStart) / ENTRANCE_MS, 0, 1);
        pulse = Math.sin(Math.PI * t);
        if (t >= 1) entranceStart = null;
      }
      paint(pulse);
      const moving =
        Math.abs(targetX - x) +
          Math.abs(targetY - y) +
          Math.abs(targetX - headX) +
          Math.abs(targetY - headY) >
          0.0005 || entranceStart !== null;
      if (moving) raf = requestAnimationFrame(step);
      else previous = 0;
    };

    const request = (): void => {
      if (!raf && !stopped && inView && !document.hidden) {
        raf = requestAnimationFrame(step);
      }
    };

    const onMove = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      if (event.target instanceof Element && event.target.closest('button')) return;
      const bounds = frame.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      targetX = clamp((2 * (event.clientX - bounds.left)) / bounds.width - 1, -1, 1);
      targetY = clamp(1 - (2 * (event.clientY - bounds.top)) / bounds.height, -1, 1);
      request();
    };

    const onLeave = (): void => {
      targetX = 0;
      targetY = 0;
      request();
    };

    const onHide = (): void => {
      if (document.hidden) cancel();
    };

    frame.addEventListener('pointermove', onMove);
    frame.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onHide);
    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(
            ([entry]) => {
              inView = entry?.isIntersecting ?? false;
              if (!inView) {
                cancel();
                scene.style.transform = '';
                head.style.transform = '';
                pearl.style.transform = '';
              }
            },
            { threshold: 0.05 }
          )
        : null;
    observer?.observe(frame);
    if (entranceStart !== null) request();

    return () => {
      stopped = true;
      cancel();
      observer?.disconnect();
      frame.removeEventListener('pointermove', onMove);
      frame.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onHide);
      scene.style.transform = '';
      head.style.transform = '';
      pearl.style.transform = '';
    };
  }, [layersOn]);

  useEffect(() => {
    if (!layersOn) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const images = Array.from(scene.querySelectorAll('img'));
    const onError = (): void => setPlateOnly(true);
    for (const image of images) image.addEventListener('error', onError);
    return () => {
      for (const image of images) image.removeEventListener('error', onError);
    };
  }, [layersOn]);

  const poster = light ? lightPoster : darkPoster;

  return (
    <div
      className={`dragon-landing${layersOn ? ' dragon-landing--motion' : ''}`}
      data-testid="dragon-landing"
      ref={frameRef}
    >
      <img
        className="dragon-landing__poster"
        data-testid="dragon-poster"
        src={poster}
        alt="JeRyu dragon"
        width={768}
        height={432}
        decoding="async"
        fetchPriority="high"
      />
      {layersOn ? (
        <div className="dragon-landing__layers" data-testid="dragon-layers" ref={sceneRef}>
          {LAYERS.map((layer) => (
            <img
              key={layer.src}
              className={layer.className}
              src={layer.src}
              alt=""
              width={640}
              height={640}
              decoding="async"
              draggable={false}
              ref={
                layer.src === layerHead ? headRef : layer.src === layerPearl ? pearlRef : undefined
              }
            />
          ))}
        </div>
      ) : null}
      {plateOnly && motionOk ? (
        <img className="dragon-landing__poster" src={characterPlate} alt="" width={512} height={512} />
      ) : null}
      {narrow && motionOk && !layersOn ? (
        <button
          type="button"
          className="dragon-landing__animate"
          onClick={() => setAsked(true)}
        >
          Animate dragon
        </button>
      ) : null}
    </div>
  );
}
