import { createMutationExclusion, type MutationPermit } from '../mutation-exclusion/gate';

type MediaMutationPermit = MutationPermit;

// policyStateIds: video-recording-control-lease, project-export-capabilities,
// project-export-job-ledger.
// This worker-local gate coordinates mutations of those registered authorities during erasure.
const mediaMutationExclusion = createMutationExclusion();
let authorityGeneration = 0;

export function acquireMediaMutationPermit(): MediaMutationPermit | null {
  return mediaMutationExclusion.acquirePermit();
}

export function getMediaAuthorityGeneration(): number {
  return authorityGeneration;
}

export function reserveMediaErasureExclusion() {
  const exclusion = mediaMutationExclusion.reserveExclusion();
  authorityGeneration += 1;
  let released = false;
  return {
    release(): void {
      if (released) return;
      released = true;
      exclusion.release();
      authorityGeneration += 1;
    },
    waitForActiveMutations(): Promise<void> {
      return exclusion.waitForActiveMutations();
    },
  };
}
