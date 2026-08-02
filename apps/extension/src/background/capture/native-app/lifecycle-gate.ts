// policyStateId: native-ingestion-erasure-exclusion
import {
  createGenerationTrackedMutationExclusion,
  type MutationExclusionReservation,
  type MutationPermit,
} from '../../mutation-exclusion/gate';

type NativeIngestionPermit = MutationPermit;
type NativeIngestionErasureExclusion = MutationExclusionReservation;

const nativeIngestionMutationExclusion = createGenerationTrackedMutationExclusion();

export function acquireNativeIngestionPermit(): NativeIngestionPermit | null {
  return nativeIngestionMutationExclusion.acquirePermit();
}

export function getNativeIngestionAuthorityGeneration(): number {
  return nativeIngestionMutationExclusion.getGeneration();
}

export function reserveNativeIngestionErasureExclusion(): NativeIngestionErasureExclusion {
  return nativeIngestionMutationExclusion.reserveExclusion();
}
