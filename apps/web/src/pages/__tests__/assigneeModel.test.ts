// assigneeModel.test.ts — which "take it on" acts each viewer is offered.

import { describe, expect, it } from 'vitest';

import { assigneeChoices, assigneeLine } from '../shift/assigneeModel';

const ada = { login: 'ada', admin: false };
const root = { login: 'root', admin: true };
const blocked = { status: 'blocked', lease_live: false, assignee: null };

describe('assigneeChoices', () => {
  it('lets any person claim or hand on a todo nobody has', () => {
    expect(assigneeChoices(blocked, ada)).toEqual({
      claim: true,
      assign: true,
      unassign: false,
      done: false,
    });
  });

  it('lets the holder finish, give back or hand on, and another user nothing', () => {
    const mine = { ...blocked, assignee: 'ada' };
    expect(assigneeChoices(mine, ada)).toEqual({
      claim: false,
      assign: true,
      unassign: true,
      done: true,
    });
    expect(assigneeChoices(mine, { login: 'bea', admin: false })).toEqual({
      claim: false,
      assign: false,
      unassign: false,
      done: false,
    });
    // An admin may hand it on or take it back; finishing stays in the admin menu.
    expect(assigneeChoices(mine, root)).toMatchObject({ assign: true, unassign: true, done: false });
  });

  it('leaves a parked todo to the admins who parked it', () => {
    const parked = { ...blocked, status: 'parked' };
    expect(assigneeChoices(parked, ada)).toMatchObject({ claim: false, assign: false });
    expect(assigneeChoices(parked, root)).toMatchObject({ claim: true, assign: true });
  });

  it('offers nothing on finished work, to the signed out, or while a worker runs it', () => {
    expect(assigneeChoices({ ...blocked, status: 'done' }, ada).claim).toBe(false);
    expect(assigneeChoices(blocked, null).claim).toBe(false);
    expect(assigneeChoices({ ...blocked, status: 'claimed', lease_live: true }, ada)).toMatchObject({
      claim: false,
      assign: false,
    });
  });
});

describe('assigneeLine', () => {
  it('says who has it', () => {
    expect(assigneeLine({ assignee: 'ada', lease_live: false, claim_by: null }, 'ada')).toBe(
      'You have this'
    );
    expect(assigneeLine({ assignee: 'ada', lease_live: false, claim_by: null }, 'bea')).toBe(
      'ada has this'
    );
    expect(assigneeLine({ assignee: null, lease_live: true, claim_by: 'op@node-0/w1' }, 'bea')).toBe(
      'A worker has this (op@node-0/w1)'
    );
    expect(assigneeLine({ assignee: null, lease_live: false, claim_by: null }, 'bea')).toBe(
      'Nobody has this yet'
    );
  });
});
