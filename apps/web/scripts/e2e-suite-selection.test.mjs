// The required browser lane runs the `@action:` matrix and the `@a11y` scans in
// one Playwright invocation. Both suites are selected by tag, so an untagged
// describe would silently stop being part of the gate: these cases hold the
// tagging and the script wiring together.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(webRoot, relative), 'utf8');
const scripts = JSON.parse(read('package.json')).scripts;
const a11ySpec = read('e2e/10-a11y.spec.ts');

describe('the a11y spec', () => {
  it('tags every describe @a11y so the required lane selects it', () => {
    const titles = [...a11ySpec.matchAll(/test\.describe\('([^']*)'/g)].map(
      (match) => match[1]
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((title) => !title.includes('@a11y'))).toEqual([]);
  });

  it('spreads its scans across the lane workers', () => {
    expect(a11ySpec).toContain("test.describe.configure({ mode: 'parallel'");
  });
});

describe('the required browser lane', () => {
  it('selects the action matrix and the a11y scans in one invocation', () => {
    const required = scripts['test:e2e:required'];
    expect(required).toContain('playwright test');
    expect(required.match(/playwright test/g)).toHaveLength(1);
    expect(required).toContain('--grep "@action:|@a11y"');
    expect(required).toContain('--grep-invert @bff');
    expect(required).toContain('JERYU_PLAYWRIGHT_E2E_MODE=ui-mocked');
  });

  it('verifies the action matrix against the report that run writes', () => {
    expect(scripts['test:e2e:ci']).toBe(
      'npm run test:e2e:required && npm run test:e2e:matrix'
    );
  });

  it('leaves the worker count to the config, which governs it', () => {
    for (const name of ['test:e2e:required', 'test:e2e:actions', 'test:e2e:a11y']) {
      expect(scripts[name]).not.toContain('--workers');
    }
  });
});
