import { createMutationExclusion, type MutationPermit } from './gate';

type MediaMutationPermit = MutationPermit;

// policyStateIds: offscreen-media-activity-lease, video-recording-control-lease,
// project-export-capabilities, project-export-job-ledger.
// This worker-local gate coordinates privileged media mutations across voice input, recording,
// export, and privacy erasure without making any one feature the shared authority owner.
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
