import type {
  ErasureParticipantResult,
  ErasureParticipantSeverity,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

export function createParticipantResult(args: {
  error?: string;
  id: string;
  remainingCount?: number;
  removedCount?: number;
  severity: ErasureParticipantSeverity;
  status: ErasureParticipantResult['status'];
}): ErasureParticipantResult {
  return {
    id: args.id,
    severity: args.severity,
    status: args.status,
    ...(args.error === undefined ? {} : { error: args.error }),
    ...(args.remainingCount === undefined ? {} : { remainingCount: args.remainingCount }),
    ...(args.removedCount === undefined ? {} : { removedCount: args.removedCount }),
  };
}
