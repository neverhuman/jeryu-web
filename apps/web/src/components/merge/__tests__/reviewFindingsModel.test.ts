// reviewFindingsModel.test.ts — which review tables get the findings layout.

import { describe, expect, it } from 'vitest';

import { findingLocation, findingsLayout, repairTablePipes } from '../reviewFindingsModel';

describe('findingsLayout', () => {
  it('folds Where into Finding and keeps the other columns in order', () => {
    expect(findingsLayout(['', 'Finding', 'Where'])).toEqual({ finding: 1, where: 2, columns: [0, 1] });
    expect(findingsLayout(['Where', ' Findings ', 'Severity'])).toEqual({ finding: 1, where: 0, columns: [1, 2] });
  });

  it('leaves a table without both columns alone', () => {
    expect(findingsLayout(['Severity', 'Finding'])).toBeNull();
    expect(findingsLayout(['Where', 'What'])).toBeNull();
    expect(findingsLayout([])).toBeNull();
  });
});

describe('findingLocation', () => {
  it('reads a path with an optional line or range', () => {
    expect(findingLocation(' .github/workflows/ci.yml:44 ')).toEqual({ path: '.github/workflows/ci.yml', line: 44 });
    expect(findingLocation('ops/ci/score.sh:41-45')).toEqual({ path: 'ops/ci/score.sh', line: 41 });
    expect(findingLocation('./Justfile')).toEqual({ path: 'Justfile', line: null });
    expect(findingLocation('agent/tool-adoption.toml')).toEqual({ path: 'agent/tool-adoption.toml', line: null });
  });

  it('leaves prose and lists of places alone', () => {
    expect(findingLocation('the whole lane')).toBeNull();
    expect(findingLocation('ci.yml:41, score.sh:19')).toBeNull();
    expect(findingLocation('general')).toBeNull();
    expect(findingLocation('')).toBeNull();
  });
});

describe('repairTablePipes', () => {
  it('turns an over-escaped pipe inside a table-row code span into an escaped one', () => {
    expect(repairTablePipes(String.raw`| 🟠 high | **Every tool is ` + '`' + String.raw`\\|\\| true` + '`' + '** | x |')).toBe(
      String.raw`| 🟠 high | **Every tool is ` + '`' + String.raw`\|\| true` + '`' + '** | x |'
    );
    expect(repairTablePipes('| x | ``a ' + String.raw`\\|` + ' b`` | y |')).toBe('| x | ``a ' + String.raw`\|` + ' b`` | y |');
  });

  it('leaves prose, fenced code and pipes outside code spans as written', () => {
    const prose = 'every remaining tool is suffixed `' + String.raw`\\|\\| true` + '`';
    expect(repairTablePipes(prose)).toBe(prose);
    const fenced = '```\n| a | `' + String.raw`x \\| y` + '` |\n```';
    expect(repairTablePipes(fenced)).toBe(fenced);
    const bare = String.raw`| a\\| b | c |`;
    expect(repairTablePipes(bare)).toBe(bare);
  });
});
