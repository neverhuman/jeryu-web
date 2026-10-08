# Fast public web flows

`bash ops/ci/web-flows.sh` exercises the built SPA in headless Chrome through
Rust's `thirtyfour` WebDriver client. It uses an in-process Rust HTTP fixture
server, one browser session, a locked Cargo dependency graph, and a matched
Chrome for Testing / ChromeDriver pair. It needs neither a backend checkout nor
a Vite development server. Build the SPA first when testing changed sources.

The journey clicks the actual page controls, reads computed opacity and grid
styles, samples moving SVG frames, submits waitlist and login forms, and asserts
captured HTTP bodies. Waitlist success, repeat receipts, empty input, 422, 429,
503, privacy clearing, native login validation, direct login/signup routes, and
returning to the bright homepage are covered. Unexpected API requests fail.
API responses are fixtures; this suite does not prove backend persistence or
authentication. Auth provider and logout regressions retain their React tests
and the broader rendered action matrix.

Artifacts go to `target/web-flows/`: screenshots, failure HTML, driver log, and a
receipt with measured elapsed time. Compilation/provisioning costs are separate
from journey runtime; Rust alone does not make browser rendering faster.

Linux x86_64 automatically provisions the pinned official browser pair. On other
platforms set `CHROME_BIN` and `CHROMEDRIVER_BIN`. Rust 1.95 is used in CI. The
generated Cargo.lock is committed; CI always uses `--locked`.
