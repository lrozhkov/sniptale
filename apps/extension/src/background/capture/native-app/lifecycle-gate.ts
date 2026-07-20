// policyStateId: native-ingestion-erasure-exclusion
import {
  createMutationExclusion,
  type MutationExclusionReservation,
  type MutationPermit,
} from '../../mutation-exclusion/gate';

type NativeIngestionPermit = MutationPermit;
type NativeIngestionErasureExclusion = MutationExclusionReservation;

let authorityGeneration = 0;
const nativeIngestionMutationExclusion = createMutationExclusion();

export function acquireNativeIngestionPermit(): NativeIngestionPermit | null {
  return nativeIngestionMutationExclusion.acquirePermit();
}

export function getNativeIngestionAuthorityGeneration(): number {
  return authorityGeneration;
}

export function reserveNativeIngestionErasureExclusion(): NativeIngestionErasureExclusion {
  const exclusion = nativeIngestionMutationExclusion.reserveExclusion();
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
