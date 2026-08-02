import { createGenerationTrackedMutationExclusion, type MutationPermit } from './gate';

type MediaMutationPermit = MutationPermit;

// policyStateIds: offscreen-media-activity-lease, video-recording-control-lease,
// project-export-capabilities, project-export-job-ledger.
// This worker-local gate coordinates privileged media mutations across voice input, recording,
// export, and privacy erasure without making any one feature the shared authority owner.
const mediaMutationExclusion = createGenerationTrackedMutationExclusion();

export function acquireMediaMutationPermit(): MediaMutationPermit | null {
  return mediaMutationExclusion.acquirePermit();
}

export function getMediaAuthorityGeneration(): number {
  return mediaMutationExclusion.getGeneration();
}

export function reserveMediaErasureExclusion() {
  return mediaMutationExclusion.reserveExclusion();
}
