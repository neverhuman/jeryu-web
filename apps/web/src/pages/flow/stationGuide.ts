export interface StationGuide {
  purpose: string;
  automation: string;
  trigger: string;
  success: string;
  failure: string;
  hold: string;
}
export const STATION_GUIDE: Record<string, StationGuide> = {
  queue: {
    purpose: 'Work accepted into the todo queue.',
    automation: 'Scheduler',
    trigger: 'An eligible worker claims the todo.',
    success: 'Work begins.',
    failure: 'A retry returns the todo to this queue.',
    hold: 'Parked or blocked todos require a recorded release decision.'
  },
  work: {
    purpose: 'A worker or person implements the change and runs local proof.',
    automation: 'Worker or person',
    trigger: 'A claimed todo or a revision requested on a pull request.',
    success: 'Finished work reaches Shift, or a direct pull request.',
    failure: 'Revise the change and run its required local checks again.',
    hold: 'A blocked attempt waits for the named owner to resolve its reason.'
  },
  shift: {
    purpose:
      'Completed worker changes wait for the shift to publish a pull request.',
    automation: 'Shift service',
    trigger: 'The configured shift schedule.',
    success: 'The pull request enters review and checks together.',
    failure: 'Repair publication, then retry the shift.',
    hold: 'Waiting for the scheduled tick is waiting, not active execution.'
  },
  review: {
    purpose: 'Assess the current pull request revision independently.',
    automation: 'Reviewer service or person',
    trigger: 'A ready pull request or a changed revision.',
    success: 'Approval joins the required-check result before merge.',
    failure: 'Requested changes return to Work and require a fresh assessment.',
    hold: 'A review requiring human judgment remains blocked until that decision is recorded.'
  },
  gate: {
    purpose:
      'Run the repository’s required checks against the current revision.',
    automation: 'Gate runner',
    trigger: 'An eligible pull request head enters the runner queue.',
    success: 'Green required checks join approval before merge.',
    failure:
      'Code failures return to Work; execution failures require repair and retry.',
    hold: 'A queued run waits for capacity. It is not an approval hold.'
  },
  merge: {
    purpose:
      'Land the revision only when its protected merge requirements are satisfied.',
    automation: 'Merge service',
    trigger:
      'Approval and required checks are valid for the revision being merged.',
    success: 'The merged revision can enter its consumer or release route.',
    failure:
      'A rebuild returns to Gate; a conflict or rejected replay returns to Work.',
    hold: 'An explicit policy or human hold must be resolved before landing.'
  },
  pin: {
    purpose:
      'Propose the source revision in a consuming repository. This creates another pull request.',
    automation: 'Auto-pin service',
    trigger:
      'An eligible source merge differs from the consumer’s pinned revision.',
    success:
      'The new consumer pull request gets its own review, required checks, and merge.',
    failure:
      'Repair or supersede the pin proposal under the repository’s rules.',
    hold: 'An existing proposal may be held by review or policy; a pin does not bypass approval.'
  },
  stage: {
    purpose:
      'Build and verify an immutable release from the merged deploy revision and pinned inputs.',
    automation: 'Auto-stage service',
    trigger: 'A scheduled tick finds an eligible unstaged deploy revision.',
    success: 'The verified release waits for activation authorization.',
    failure: 'Repair the build or environment and retry staging.',
    hold: 'The timer wait is separate from build execution. No start signal means execution time is unknown.'
  },
  deploy: {
    purpose:
      'Activate the authorized release and verify its running version and health.',
    automation: 'Release action service',
    trigger: 'An authorized person requests activation of a staged release.',
    success:
      'A successful deployment receipt proves which revisions reached production.',
    failure:
      'Inspect deployment evidence; repair or deliberately roll back before retrying.',
    hold: 'Staged releases intentionally wait for authorization. Staging alone does not activate production.'
  }
};
