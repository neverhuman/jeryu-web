import { describe, expect, it } from 'vitest';
import { INVENTORY } from '../../test/fixtures/delivery';
import { candidateWindow, runningTargets } from './model';
describe('candidate production window', () => {
  it('includes failed and never-deployed builds through previous production, newest first', () => {
    const result = candidateWindow([...INVENTORY.builds].reverse(), INVENTORY.placements, INVENTORY.deliverable, false);
    expect(result.rows.map(build => build.id)).toEqual(['rc-21', 'rc-20', 'rc-19', 'rc-18', 'rc-17']);
    expect(result.current.has('rc-18')).toBe(true);
    expect(result.previous.has('rc-17')).toBe(true);
    expect(result.hidden).toBe(1);
  });
  it('uses deployment history after a rollback, even when previous production is a newer build', () => {
    const placements = [{ ...INVENTORY.placements[1], current: 'rc-17', previous: 'rc-19' }];
    expect(candidateWindow(INVENTORY.builds, placements, 'Cloud app', false).rows.at(-1)?.id).toBe('rc-17');
  });
  it('does not truncate an incomplete history or guess production from a tag', () => {
    const result = candidateWindow(INVENTORY.builds.slice(0, 4), INVENTORY.placements, 'Cloud app', false);
    expect(result.boundaryLoaded).toBe(false);
    expect(result.rows).toHaveLength(4);
    expect(candidateWindow(INVENTORY.builds, [], 'Cloud app', false).current.size).toBe(0);
  });
  it('keeps the boundary open when one production target has no previous release', () => {
    const placements = [...INVENTORY.placements, { ...INVENTORY.placements[1], target: 'app-02', previous: null }];
    expect(candidateWindow(INVENTORY.builds, placements, 'Cloud app', false).boundaryLoaded).toBe(false);
  });
  it('keeps all loaded history on demand and finds every environment for the same build', () => {
    expect(candidateWindow(INVENTORY.builds, INVENTORY.placements, 'Cloud app', true).rows).toHaveLength(6);
    expect(runningTargets(INVENTORY.builds[3], INVENTORY.placements).map(p => p.environment)).toEqual(['production', 'staging']);
  });
});
