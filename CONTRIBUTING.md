# Contributing

Outside pull requests are welcome on GitHub.

## How pull requests are handled

This GitHub repository is a read-only mirror of the project's forge. The forge is where
contributions are gated, reviewed and merged. When your change is merged there, the GitHub
pull request is closed with a link to the merged result.

Until the importer that brings GitHub pull requests to the forge is live, pull requests are
read but not merged yet. They will not be ignored, but expect no merge or reply until then.

## Tests and fixtures

Tests and fixtures must use invented data only: organizations such as `acme` or `globex`,
hosts under `*.example`, and made-up users. Never include real hostnames, accounts, tokens
or paths.

## Running the gate locally

You need Node 20 or newer. From `apps/web`, pick a free port for Playwright, then run:

```sh
export JERYU_PLAYWRIGHT_WEB_PORT=<a free local port>
npx tsc --noEmit -p .
npx vitest run
PLAYWRIGHT_JUNIT_OUTPUT_FILE=playwright-report/junit.xml npm run -s test:e2e:actions -- --reporter=junit
npm run -s test:e2e:matrix
```

All four steps must pass before you open a pull request.
