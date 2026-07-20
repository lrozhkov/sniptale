// policyStateId: diagnostics-erasure-exclusion
import {
  createMutationExclusion,
  type MutationExclusionReservation,
  type MutationPermit,
} from '../mutation-exclusion/gate';

type DiagnosticsMutationPermit = MutationPermit;
type DiagnosticsErasureExclusion = MutationExclusionReservation;

const diagnosticsMutationExclusion = createMutationExclusion();

export function acquireDiagnosticsMutationPermit(): DiagnosticsMutationPermit | null {
  return diagnosticsMutationExclusion.acquirePermit();
}

export async function runWithDiagnosticsMutationPermit<T>(
  operation: () => Promise<T>,
  rejectionMessage: string
): Promise<T> {
  const releaseMutation = acquireDiagnosticsMutationPermit();
  if (!releaseMutation) throw new Error(rejectionMessage);
  try {
    return await operation();
  } finally {
    releaseMutation();
  }
}

export function reserveDiagnosticsErasureExclusion(): DiagnosticsErasureExclusion {
  return diagnosticsMutationExclusion.reserveExclusion();
}
