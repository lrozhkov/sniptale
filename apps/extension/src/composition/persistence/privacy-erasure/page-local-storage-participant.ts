import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';
import type { ErasureParticipant } from './participant-types';

export interface ExtensionPageLocalStorageErasureAdapter {
  erase(options: { preservePreferences: boolean }): Promise<number>;
  prepare(): Promise<void>;
  release(): Promise<void>;
  verifyEmpty(options: { preservePreferences: boolean }): Promise<boolean>;
}

function createResult(
  status: ErasureParticipantResult['status'],
  counts: Pick<ErasureParticipantResult, 'remainingCount' | 'removedCount'>
): ErasureParticipantResult {
  return {
    id: 'extension-page:local-storage',
    severity: 'required',
    status,
    ...(counts.remainingCount === undefined ? {} : { remainingCount: counts.remainingCount }),
    ...(counts.removedCount === undefined ? {} : { removedCount: counts.removedCount }),
  };
}

export function createExtensionPageLocalStorageParticipant(
  adapter: ExtensionPageLocalStorageErasureAdapter,
  options: { preservePreferences: boolean }
): ErasureParticipant {
  return {
    id: 'extension-page:local-storage',
    severity: 'required',
    async erase() {
      return createResult('erased', { removedCount: await adapter.erase(options) });
    },
    async verifyEmpty() {
      const empty = await adapter.verifyEmpty(options);
      return createResult(empty ? 'verified-empty' : 'failed', {
        remainingCount: empty ? 0 : 1,
      });
    },
  };
}
