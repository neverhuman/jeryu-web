// features.ts — the core-feature slides previewed on the boot carousel.
//
// Each slide has a headline, a one-line tagline, an accent (a design-token
// var reference), and a decorative ASCII "mini-mock" of the feature surface.
// Copy follows the glossary (`src/words/glossary.ts`) and its guard test: we
// say pull requests, never the retired review noun and never "PR".

export interface FeatureSlide {
  id: string;
  label: string;
  title: string;
  tagline: string;
  /** A design-token var() reference, e.g. 'var(--color-accent-info)'. */
  accent: string;
  /** Decorative ASCII preview (rendered in a <pre>, aria-hidden). */
  preview: string;
}

export const FEATURES: readonly FeatureSlide[] = [
  {
    id: 'repos',
    label: 'REPOSITORIES',
    title: 'Repositories',
    tagline: 'Every repo, one grid — search, health, pull requests, one-click create.',
    accent: 'var(--color-accent-info)',
    preview: `repos ▸ 12                 ⌕ search
──────────────────────────────────
▸ jeryu-core     ● 3 open   ✓ ci
▸ jeryu-web      ● 1 open   ✓ ci
▸ jeryu-deploy   ● 0 open   ▲ ci
＋ new repository`,
  },
  {
    id: 'pull-room',
    label: 'IN FLIGHT',
    title: 'In flight',
    tagline: 'Every change on its way to a release: shift work, open pull requests and their checks, in one place.',
    accent: 'var(--color-accent-success)',
    preview: `OPEN ──── CHECKS ──── REVIEW ─── MERGE
 #128     running      2 ✎      ✓ ready
 #131     ✓ pass       1 ✎      ⧗ hold
 #140     ✗ fail       0 ✎      ▲ block`,
  },
  {
    id: 'work',
    label: 'WORK',
    title: 'Work',
    tagline: 'Split-wide tracker for todos, bugs, chores, docs & CI follow-up.',
    accent: 'var(--color-accent-warning)',
    preview: `[ FEAT  ] auth cutover        ▰▰▰▱ 74%
[ BUG   ] ws reconnect drift  ▰▱▱▱ 20%
[ CHORE ] bump toolchain      ▰▰▰▰ done
[ DOC   ] forge runbook       ▱▱▱▱  new`,
  },
  {
    id: 'fleet',
    label: 'RUNNERS',
    title: 'Runners',
    tagline: 'Live runner-fabric mission control — utilization & health.',
    accent: 'var(--color-accent-primary)',
    preview: `runners  ▮▮▮▮▮▮▯▯   74% saturated
pool:ci  ██████░░   jobs 18
pool:gpu ███░░░░░   jobs  4
scm ✓   db ✓   cache ✓   vault ✓`,
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    title: 'Intelligence',
    tagline: 'Prioritized insights over an interactive dependency graph.',
    accent: 'var(--color-accent-secondary)',
    preview: `insights ◆ 5 prioritized
 ┌ jeryu-core ┐      ┌ web ┐
 │     ●──────┼─────▶│  ●  │
 └─────┬──────┘      └──┬──┘
   fresh 2h          stale 9d`,
  },
  {
    id: 'tools',
    label: 'SHARED TOOLS',
    title: 'Shared tools',
    tagline: 'Find duplicated code, approve shared tools, track where they are adopted.',
    accent: 'var(--color-gold)',
    preview: `tool             repos    LOC saved
jankurai-diff    7/7      ▰▰▰▰▰ 4.2k
forge-gate       6/7      ▰▰▰▰  3.1k
dup-finder       5/7      ▰▰▰   1.9k
► propose adoption ×2`,
  },
];
