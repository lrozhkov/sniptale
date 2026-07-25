import { createSkippedStep, createViolationStep } from './focused-qa-results.mjs';
import { timeSyncStep } from './step-timing.helpers.mjs';
import { runAppCoreOwnerCheck } from './verify-app-core-owners.mjs';
import { runTargetOnlyPathCheck } from './verify-target-only-paths.mjs';

const OWNER_GUARDS = Object.freeze({
  appOwners: {
    header: 'App-core owner violations found:',
    label: 'App-core owners',
    runner: runAppCoreOwnerCheck,
  },
  targetPaths: {
    header: 'Target-only path violations found:',
    label: 'Target-only paths',
    runner: runTargetOnlyPathCheck,
  },
});

export const OWNER_GUARD_LANES = Object.freeze(Object.keys(OWNER_GUARDS));

export function collectOwnerGuardStep(lane) {
  const guard = OWNER_GUARDS[lane];
  if (!guard) throw new Error(`Unknown owner guard lane: ${lane}`);
  return timeSyncStep(() => createViolationStep(guard.label, guard.header, guard.runner()));
}

export function createDeferredOwnerGuardStep(lane) {
  const guard = OWNER_GUARDS[lane];
  if (!guard) throw new Error(`Unknown owner guard lane: ${lane}`);
  return createSkippedStep(guard.label, 'scheduled in bounded owner lane');
}

export function isOwnerGuardLabel(label) {
  return Object.values(OWNER_GUARDS).some((guard) => guard.label === label);
}

export function replaceDeferredOwnerGuardSteps(steps, ownerSteps) {
  const replacements = new Map(ownerSteps.map((step) => [step.label, step]));
  return steps.map((step) => replacements.get(step.label) ?? step);
}
