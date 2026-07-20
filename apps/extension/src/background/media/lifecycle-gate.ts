import { createMutationExclusion, type MutationPermit } from '../mutation-exclusion/gate';

type MediaMutationPermit = MutationPermit;

// policyStateIds: video-recording-control-lease, project-export-capabilities,
// project-export-job-ledger.
// This worker-local gate coordinates mutations of those registered authorities during erasure.
const mediaMutationExclusion = createMutationExclusion();

export function acquireMediaMutationPermit(): MediaMutationPermit | null {
  return mediaMutationExclusion.acquirePermit();
}

export function reserveMediaErasureExclusion() {
  return mediaMutationExclusion.reserveExclusion();
}
