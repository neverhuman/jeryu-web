# Graphic dragon moving into the future

The supplied reference guides a simpler graphic illustration: broad cyan,
cobalt and indigo ribbons, pearl planes, fewer scale marks, one connected body
and one tail. The head faces right; mane and tail trail left. Real transparency
joins the artwork to the continuous page grid. The master, exact built-in
imagegen prompt and anatomy/alpha review live alongside this document.

Regenerate the declared v6 zone from the repository root with
`node apps/web/scripts/export-landing-graphic-scene.mjs`. The Node exporter
preserves alpha and records dimensions, byte counts and hashes without
upscaling. Earlier revisions remain on the preview branch; this branch carries the approved graphic.

Five short SVG light trails stream right to left behind the right-facing dragon. Their
opacity falls to zero before each reset. The stationary grid stays legible;
a soft atmospheric wash also streams left, fading before its reset. The
dragon is one complete graphic with no independently moving anatomy. There
are no circles, circuit nodes, per-frame JavaScript or extra dependencies.
Motion runs automatically without a page control; system preferences and
the existing visibility/intersection lifecycle still suspend it.

The header is the sole wordmark, the top waitlist link opens its public page,
and native login and the existing logout repair retain their behavior.

## Composition and breakpoints

The hero is a two-part composition: the dragon on the left, the copy on the
right. The dragon is absolute inside the scene, anchored to the left edge of
the 1600px content frame, and its tail recedes under the first story section.
The headline leads at display scale (up to 96px); the lede, the waitlist pill
and the secondary "See how it works" link follow. Every primary call to
action on the public pages (the navigation and hero `.marketing-pill`, and
every `.waitlist__submit` on the waitlist, login/signup, create-account and
account-recovery forms) is the same pill from `MarketingPill.css`: rounded, on
a cyan-to-blue gradient, with a short lift on hover.

| Range | Hero | Dragon | Workflow steps |
|---|---|---|---|
| phone, under 768px | one column: eyebrow, headline, lede, pill, then the dragon | in flow after the copy, cropped to a 4:3 band showing the head and mane | one vertical timeline on a left rail |
| tablet, 768–1023px | one column, copy capped at 640px | in flow, a 2:1 band anchored right with a slight bleed | two across; the gated merge spans the row |
| desktop, 1024px and up | dragon left, copy in the right column | absolute, 52vw wide (540px to 1086px) from the frame's left edge | five across |
| wide, 1280px and up | same, full display scale | same | same |

Below 1024px the navigation is sticky and compact, so the waitlist pill is
one tap away from anywhere in the story. The forms (waitlist, login, signup)
keep the dragon as a faint absolute backdrop at every width.

Stacking order inside the scene, back to front: atmosphere wash (0), dragon
and slipstream (1), technical grid (2), content (3), the dragon's retry
notice (4), navigation (5). The hero copy keeps its own halo behind the text.
The grid belongs to the hero: it fades from 55% down the story and is gone
by 75%, so the workflow and the closing section sit on plain navy.

Motion stays subtle: the dragon follows the first 900px of scroll at a tenth
of the speed, and the story sections rise the last 20px into place as they
enter the viewport. The reveal moves but never hides, so full-page evidence
captures always show the whole story. Both are CSS scroll-driven animations;
browsers without them, and readers who prefer reduced motion, see everything
in its final place.


The shared `MarketingScene` owns the alpha dragon, grid and motion lifecycle
for the landing, public waitlist and native login/signup views. Login keeps
the scene mounted, and the public waitlist uses the same scene around its
header/content. Shared copy veils and opaque form panels protect readability.
Preferences, Save-Data, hidden tabs and offscreen content still suspend motion;
opening authentication does not remove the graphic or stop the background.

While a public waitlist or native login/signup form is open, only the dragon
poster fades to 10% opacity. Returning to the story restores full opacity;
state is derived from the current view and is never stored. The grid and
slipstream continue their existing lifecycle. The short opacity transition
is disabled for reduced motion and forced colors.
