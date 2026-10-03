// releaseBoardModel.test.ts — the pure half of the family release board: the
// live overlay, work bar percentages, snapshot freshness, the stage track's
// connectors and the never-deployed styling, the fixed-column layout and
// lane groups, and which family is shown.

import { describe, expect, it } from 'vitest';

import type { EnvironmentSummary } from '../../api/types/deployments';
import type { BoardStage, BoardState, BoardWork } from '../../api/types/releaseBoard';
import {
  ACME_BOARD,
  GLOBEX_BOARD,
  INITECH_BOARD,
  listResponse,
} from '../../test/fixtures/releaseBoard';
import {
  BOARD_STALE_AFTER_MS,
  boardColumns,
  boardFreshness,
  connectorLabel,
  forgeRepos,
  laneGroups,
  laneLayout,
  noPromoteText,
  observedLine,
  openStageId,
  OVERLAY_NOTE,
  pickFamily,
  pillClass,
  pinBehindState,
  pinColumns,
  promoteWho,
  stageCellClass,
  stageConnector,
  stageOverlay,
  targetStateText,
  unshipped,
  unshippedHeadline,
  unshippedPinsText,
  versionNamesSha,
  withOpenStage,
  workShares,
  workSummary,
} from '../releaseBoard/model';

const OBSERVED = ACME_BOARD.observed_at; // 2026-09-28T15:40:00Z

function stage(laneId: string, stageId: string, board = ACME_BOARD): BoardStage {
  const found = board.lanes.find((l) => l.id === laneId)?.stages.find((s) => s.id === stageId);
  if (!found) throw new Error(`no stage ${laneId}/${stageId}`);
  return found;
}

function acmeWork(): BoardWork {
  const work = ACME_BOARD.work;
  if (!work) throw new Error('the acme fixture carries a work bar');
  return work;
}

function environment(name: string, sha: string, createdAt: string, ref = 'main'): EnvironmentSummary {
  const current = {
    deployment: {
      id: 7,
      sha,
      ref,
      task: 'deploy',
      environment: name,
      description: null,
      payload: {},
      creator: { login: 'deployer' },
      created_at: createdAt,
      production_environment: name === 'production',
      transient_environment: false,
    },
    status: null,
    succeeded: true,
  };
  return { name, latest: current, current, previous: null };
}

describe('stageOverlay', () => {
  const prod = stage('cloud-app', 'prod');

  it('shows a newer forge deployment of a different commit as reported', () => {
    const sha = '1a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d';
    const overlay = stageOverlay(prod, OBSERVED, [
      environment('production', sha, '2026-09-28T15:52:00Z', 'v0.8.13'),
    ]);
    expect(overlay).toEqual({
      version: 'v0.8.13 · 1a2b3c4',
      sha,
      ref: 'v0.8.13',
      reportedAt: '2026-09-28T15:52:00Z',
      knownBy: 'reported',
      note: OVERLAY_NOTE,
    });
    expect(OVERLAY_NOTE).toBe('reported after this snapshot');
  });

  it('leaves the snapshot alone when the deployment is older than the snapshot', () => {
    const overlay = stageOverlay(prod, OBSERVED, [
      environment('production', 'f'.repeat(40), '2026-09-28T15:39:59Z', 'v0.8.13'),
    ]);
    expect(overlay).toBeNull();
  });

  it('leaves the snapshot alone when the newer deployment is the commit it already names', () => {
    const overlay = stageOverlay(prod, OBSERVED, [
      environment('production', `96d8374${'0'.repeat(33)}`, '2026-09-28T16:10:00Z', 'v0.8.12'),
    ]);
    expect(overlay).toBeNull();
  });

  it('reads only the environment the stage links to, and needs a forge link at all', () => {
    const newer = environment('dev', 'e'.repeat(40), '2026-09-28T16:00:00Z');
    expect(stageOverlay(prod, OBSERVED, [newer])).toBeNull();
    expect(stageOverlay(stage('cloud-app', 'main'), OBSERVED, [newer])).toBeNull();
    expect(stageOverlay(prod, OBSERVED, undefined)).toBeNull();
    const dev = stageOverlay(stage('cloud-app', 'dev'), OBSERVED, [newer]);
    expect(dev?.version).toBe('main · eeeeeee');
  });

  it('does not repeat a ref that is itself the commit', () => {
    const sha = 'abcdef0123456789abcdef0123456789abcdef01';
    const overlay = stageOverlay(stage('cloud-app', 'dev'), OBSERVED, [
      environment('dev', sha, '2026-09-28T16:00:00Z', sha),
    ]);
    expect(overlay?.version).toBe('abcdef0');
  });

  it('matches a sha abbreviation anywhere in the version text', () => {
    expect(versionNamesSha('v0.8.12 · 96d8374', `96d8374${'a'.repeat(33)}`)).toBe(true);
    expect(versionNamesSha('prod-20260926T051051Z-be19083', `be19083${'a'.repeat(33)}`)).toBe(true);
    expect(versionNamesSha('never deployed', 'a'.repeat(40))).toBe(false);
    expect(versionNamesSha(null, 'a'.repeat(40))).toBe(false);
  });

  it('lists each linked forge repository once', () => {
    expect(forgeRepos(ACME_BOARD)).toEqual(['acme/app']);
    expect(forgeRepos(GLOBEX_BOARD)).toEqual(['globex/server']);
    expect(forgeRepos(INITECH_BOARD)).toEqual([]);
  });
});

describe('workShares', () => {
  it('rounds each part to a whole percent of the total, zeros included', () => {
    const shares = workShares(acmeWork());
    expect(shares.map((s) => [s.key, s.count, s.percent])).toEqual([
      ['live', 3, 43],
      ['merged', 0, 0],
      ['stranded', 2, 29],
      ['untraceable', 0, 0],
      ['blocked', 2, 29],
      ['open', 0, 0],
    ]);
    // The bar uses the unrounded share, so the parts always fill it.
    expect(shares.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100);
  });

  it('gives zero everywhere for an empty queue instead of dividing by zero', () => {
    const shares = workShares({ total: 0, method: 'm', parts: [{ key: 'live', label: 'Live', count: 0 }] });
    expect(shares[0]).toMatchObject({ percent: 0, width: 0 });
  });

  it('describes the bar in words for assistive tech', () => {
    expect(workSummary(acmeWork())).toBe(
      '7 todos. Live: 3, Merged, not released: 0, Stranded in open shift PRs #11, #12: 2, Untraceable: 0, Blocked: 2, Open: 0.'
    );
  });
});

describe('freshness', () => {
  const observed = Date.parse(OBSERVED);

  it('flags a snapshot older than 15 minutes as stale, and not one at the threshold', () => {
    expect(boardFreshness(OBSERVED, observed + BOARD_STALE_AFTER_MS).stale).toBe(false);
    expect(boardFreshness(OBSERVED, observed + BOARD_STALE_AFTER_MS + 1).stale).toBe(true);
    expect(BOARD_STALE_AFTER_MS).toBe(15 * 60_000);
  });

  it('says how long ago in the one relative wording', () => {
    expect(boardFreshness(OBSERVED, observed + 30_000).ago).toBe('just now');
    expect(boardFreshness(OBSERVED, observed + 12 * 60_000).ago).toBe('12 min ago');
    expect(boardFreshness(OBSERVED, observed + 3 * 3_600_000).ago).toBe('3 h ago');
    expect(boardFreshness(OBSERVED, observed + 48 * 3_600_000).ago).toBe('2 days ago');
    expect(boardFreshness('not a time', observed)).toEqual({ ageMs: null, stale: false, ago: 'not a time' });
  });

  it('names the trigger and host of the snapshot', () => {
    expect(observedLine(ACME_BOARD, observed + 5 * 60_000)).toBe(
      'observed 5 min ago · manual run on collector-1'
    );
  });
});

describe('stage track', () => {
  const lane = ACME_BOARD.lanes[0];

  it('puts an arrow between stages that follow, a double bar beside a parallel one', () => {
    expect(lane?.stages.map((s, i) => stageConnector(s, i))).toEqual([null, '→', '‖', '→']);
    expect(connectorLabel('‖')).toBe('runs beside the previous stage');
    expect(connectorLabel('→')).toBe('then');
  });

  it('dashes a never-deployed stage and says it was never deployed to', () => {
    const idle = stage('forge-server', 'dev', GLOBEX_BOARD);
    expect(stageCellClass(idle, false)).toBe(
      'release-board__cell release-board__cell--unknown release-board__cell--never-deployed'
    );
    expect(stageCellClass(stage('cloud-app', 'prod'), true)).toBe(
      'release-board__cell release-board__cell--failed release-board__cell--open'
    );
    expect(noPromoteText(idle)).toMatch(/never deployed to/);
    expect(noPromoteText(stage('cloud-app', 'main'))).toBe("This is the lane's source; nothing promotes into it.");
  });

  it('maps states to pills and target words', () => {
    expect(pillClass('ok')).toBe('page__pill page__pill--success');
    expect(pillClass('warn')).toBe('page__pill page__pill--warning');
    expect(pillClass('bad')).toBe('page__pill page__pill--failed');
    expect(pillClass('none')).toBe('page__pill');
    const states: BoardState[] = ['ok', 'warn', 'bad', 'none'];
    expect(states.map(targetStateText)).toEqual([
      'agrees',
      'behind',
      'behind',
      'unknown',
    ]);
  });

  it('says who runs a promote command', () => {
    expect(promoteWho({ command: 'x', human_only: true, automatic: false })).toMatch(/^A person runs this/);
    expect(promoteWho({ command: 'x', human_only: false, automatic: true })).toMatch(/^Happens by itself/);
    expect(promoteWho({ command: 'x', human_only: false, automatic: false })).toBe('Anyone with push can run this:');
  });
});

describe('fixed columns', () => {
  const columns = boardColumns(GLOBEX_BOARD);
  const lane = (id: string) => {
    const found = GLOBEX_BOARD.lanes.find((l) => l.id === id);
    if (!found) throw new Error(`no lane ${id}`);
    return found;
  };
  const ids = (id: string) =>
    laneLayout(lane(id), columns).cells.map((cell) => cell.stages.map((s) => s.id));

  it('reads the columns a board declares, and none when it declares none', () => {
    expect(columns.map((c) => c.id)).toEqual(['main', 'dev', 'stage', 'prod']);
    expect(boardColumns(ACME_BOARD)).toEqual([]);
  });

  it('puts every column in every lane once, stacking stages that share one', () => {
    expect(ids('forge-server')).toEqual([['shift', 'main'], ['dev'], ['staged'], ['production']]);
    expect(ids('web-ui')).toEqual([['main'], [], ['pinned'], ['production']]);
    expect(ids('gate-runner')).toEqual([['main'], [], [], ['installed']]);
  });

  it('keeps a stage that names no declared column, instead of dropping it', () => {
    expect(laneLayout(lane('forge-server'), columns).unplaced.map((s) => s.id)).toEqual([
      'canary-stable',
    ]);
    const stray = { ...lane('web-ui'), stages: [{ ...stage('web-ui', 'main', GLOBEX_BOARD), column: 'qa' }] };
    expect(laneLayout(stray, columns).unplaced.map((s) => s.id)).toEqual(['main']);
  });

  it('gathers neighbouring lanes of one group and leaves ungrouped lanes alone', () => {
    const groups = laneGroups(GLOBEX_BOARD.lanes).map((g) => [g.name, g.lanes.map((l) => l.id)]);
    expect(groups).toEqual([
      [null, ['forge-server']],
      [null, ['web-ui']],
      ['Tools', ['gate-runner', 'reviewer', 'scorer']],
    ]);
  });
});

describe('pins', () => {
  it('splits the header row into repo, cell and behind columns', () => {
    expect(pinColumns(GLOBEX_BOARD.pins ?? { note: '', columns: [], rows: [] })).toEqual({
      repo: 'Repo',
      cells: ['Main', 'Pinned', 'In prod'],
      behind: 'Behind',
    });
  });

  it('grades how far behind a pin is', () => {
    expect([0, 4, 20, 21, null].map(pinBehindState)).toEqual(['ok', 'warn', 'warn', 'bad', 'none']);
  });
});

describe('pickFamily', () => {
  const { boards } = listResponse();

  it('prefers the URL, then the remembered family, then the first reported', () => {
    expect(pickFamily(boards, 'initech', 'globex')).toBe('initech');
    expect(pickFamily(boards, null, 'globex')).toBe('globex');
    expect(pickFamily(boards, null, 'gone')).toBe('acme');
    expect(pickFamily(boards, null, null)).toBe('acme');
    expect(pickFamily([], null, 'globex')).toBeNull();
  });
});

describe('unshipped', () => {
  it('collects warn and bad stages, pins that are not level, and merged or stranded work', () => {
    const found = unshipped(INITECH_BOARD);
    expect(found?.stages).toEqual([
      { laneId: 'free-download', lane: 'Package', stage: 'tagged', status: 'main 13 ahead', state: 'warn' },
    ]);
    expect(found?.pins.map((pin) => pin.repo)).toEqual([
      'packager',
      'engine-core',
      'reports',
      'cli',
      'starforge',
      'contracts',
      'engine',
      'numerics',
    ]);
    expect(found?.pinLabel).toBe('Main ahead');
    expect(found?.merged).toBe(1);
    expect(found?.stranded).toBe(1);
    // A pin more than 20 behind is bad, so the banner is too.
    expect(found?.state).toBe('bad');
    expect(found && unshippedHeadline(found)).toBe(
      'Not shipped yet: 1 stage marked for attention · 8 of 9 pinned repos not level · ' +
        '1 done todo merged, not released · 1 done todo stranded on a branch.'
    );
    expect(unshippedPinsText(found?.pins ?? [])).toBe(
      'packager 105, engine-core 56, reports 22, cli 18, starforge 16 and 3 more'
    );
  });

  it('stays yellow when nothing is bad, and is null when everything ships', () => {
    const level = {
      ...GLOBEX_BOARD,
      lanes: GLOBEX_BOARD.lanes.map((lane) => ({
        ...lane,
        stages: lane.stages.map((stage) => ({ ...stage, state: 'ok' as const })),
      })),
    };
    const pins = { note: '', columns: ['Repo', 'Behind'], rows: [{ repo: 'tracker', cells: [], behind: 4 }] };
    expect(unshipped({ ...level, pins, work: undefined })?.state).toBe('warn');
    expect(unshipped({ ...level, pins: undefined, work: undefined })).toBeNull();
  });

  it('reads and writes the open stage cell of each lane', () => {
    const entries = ['cloud-app:prod', 'web-ui:pinned'];
    expect(openStageId(entries, 'cloud-app')).toBe('prod');
    expect(openStageId(entries, 'reviewer')).toBeNull();
    // A lane's own cell moves; every other lane keeps the one it had open.
    expect(withOpenStage(entries, 'cloud-app', 'stage')).toEqual([
      'web-ui:pinned',
      'cloud-app:stage',
    ]);
    expect(withOpenStage(entries, 'cloud-app', null)).toEqual(['web-ui:pinned']);
    expect(withOpenStage([], 'cloud-app', 'prod')).toEqual(['cloud-app:prod']);
  });

  it('ignores an entry that names no lane', () => {
    expect(openStageId(['prod', ':prod', 'cloud-app:'], 'cloud-app')).toBe('');
    expect(openStageId(['prod'], 'prod')).toBeNull();
  });
});
