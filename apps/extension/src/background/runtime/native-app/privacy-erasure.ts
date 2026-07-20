import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import { reserveNativeIngestionErasureExclusion } from '../../capture/native-app/lifecycle-gate';
import { getNativeAppRuntimeService } from './service-singleton';

function cleanupNativeIngestionRuntime(): Promise<readonly ErasureParticipantResult[]> {
  getNativeAppRuntimeService().quiesceForPrivacyErasure();
  return Promise.resolve([
    {
      id: 'native-ingestion-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);
}

export const nativeIngestionPrivacyErasureCleanupAdapter = {
  cleanup: cleanupNativeIngestionRuntime,
  reserveErasureExclusion: reserveNativeIngestionErasureExclusion,
};
