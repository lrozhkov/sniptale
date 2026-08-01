import type { ErasureParticipant } from './participant-types';

export interface RecordingStagingErasureAdapter {
  countSessions(): Promise<number>;
  erase(): Promise<number>;
}

export function createRecordingStagingErasureParticipant(
  adapter: RecordingStagingErasureAdapter
): ErasureParticipant {
  const id = 'opfs:recording-staging';
  return {
    id,
    severity: 'required',
    async erase() {
      const removedCount = await adapter.erase();
      return { id, removedCount, severity: 'required', status: 'erased' };
    },
    async verifyEmpty() {
      const remainingCount = await adapter.countSessions();
      return {
        id,
        remainingCount,
        severity: 'required',
        status: remainingCount === 0 ? 'verified-empty' : 'failed',
      };
    },
  };
}
