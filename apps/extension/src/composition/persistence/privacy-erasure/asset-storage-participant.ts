import type { ErasureParticipant } from './participant-types';

export interface AssetStorageErasureAdapter {
  countRoots(): Promise<number>;
  erase(): Promise<number>;
}

export function createAssetStorageErasureParticipant(
  adapter: AssetStorageErasureAdapter
): ErasureParticipant {
  const id = 'opfs:durable-assets';
  return {
    id,
    severity: 'required',
    async erase() {
      const removedCount = await adapter.erase();
      return { id, removedCount, severity: 'required', status: 'erased' };
    },
    async verifyEmpty() {
      const remainingCount = await adapter.countRoots();
      return {
        id,
        remainingCount,
        severity: 'required',
        status: remainingCount === 0 ? 'verified-empty' : 'failed',
      };
    },
  };
}
