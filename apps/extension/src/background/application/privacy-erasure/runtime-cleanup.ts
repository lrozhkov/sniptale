import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import {
  resetBackgroundRuntimeStateForLocalDataErasure,
  type BackgroundRuntimeState,
} from '../runtime-state';

export const backgroundRuntimeCleanupAdapter = {
  async cleanup(state: BackgroundRuntimeState): Promise<readonly ErasureParticipantResult[]> {
    resetBackgroundRuntimeStateForLocalDataErasure(state);
    return [
      {
        id: 'background-runtime-state',
        remainingCount: 0,
        severity: 'required',
        status: 'verified-empty',
      },
    ];
  },
};
