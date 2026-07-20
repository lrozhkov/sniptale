import type {
  ErasureParticipantResult,
  ErasureParticipantSeverity,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

export interface ErasureParticipant {
  erase(): Promise<ErasureParticipantResult>;
  getRemovedKeys?: (() => readonly string[]) | undefined;
  id: string;
  severity: ErasureParticipantSeverity;
  verifyEmpty(): Promise<ErasureParticipantResult>;
}
