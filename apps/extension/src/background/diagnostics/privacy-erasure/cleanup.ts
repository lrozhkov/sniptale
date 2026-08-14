import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import { reserveDiagnosticsErasureExclusion } from '../lifecycle-gate';
import {
  hasActiveDiagnosticsSessions,
  listActiveDiagnosticsSessions,
  resetDiagnosticsStateForLocalDataErasure,
} from '../state';
import { shutDownDiagnosticsSessionForPrivacyErasure } from '../runtime.privacy-erasure';

export const diagnosticsPrivacyErasureCleanupAdapter = {
  async cleanup(): Promise<readonly ErasureParticipantResult[]> {
    for (const session of listActiveDiagnosticsSessions()) {
      await shutDownDiagnosticsSessionForPrivacyErasure(session);
    }
    await resetDiagnosticsStateForLocalDataErasure();
    if (hasActiveDiagnosticsSessions()) {
      throw new Error('Diagnostics cleanup verification failed');
    }
    return [
      {
        id: 'diagnostics-runtime-state',
        remainingCount: 0,
        severity: 'required',
        status: 'verified-empty',
      },
    ];
  },
  reserveErasureExclusion: reserveDiagnosticsErasureExclusion,
};
