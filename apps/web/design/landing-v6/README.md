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

The desktop story is lifted 50px: the scene top moves from 52px to 2px,
the centered hero is 50px shorter, and its copy has a further 25px offset.
The header and native auth keep their position. Phones retain their clear
header/content spacing. Rendered desktop geometry records the before/after
positions and checks the exact 50px lift.


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
