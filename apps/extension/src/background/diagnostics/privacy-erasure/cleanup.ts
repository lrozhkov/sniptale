import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import { reserveDiagnosticsErasureExclusion } from '../lifecycle-gate';
import {
  hasActiveDiagnosticsSessions,
  listActiveDiagnosticsSessions,
  resetDiagnosticsStateForLocalDataErasure,
} from '../state';
import {
  quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure,
  shutDownDiagnosticsSessionForPrivacyErasure,
} from '../runtime.privacy-erasure';
import { quiesceExportHarSessionsForPrivacyErasure } from '../export-har-collector/privacy-erasure';
import { invalidateExportHarStartAuthorityForPrivacyErasure } from '../export-har-collector/start-capability';

export const diagnosticsPrivacyErasureCleanupAdapter = {
  async cleanup(): Promise<readonly ErasureParticipantResult[]> {
    invalidateExportHarStartAuthorityForPrivacyErasure();
    for (const session of listActiveDiagnosticsSessions()) {
      await shutDownDiagnosticsSessionForPrivacyErasure(session);
    }
    await quiesceOrphanedDiagnosticsDebuggerClientsForPrivacyErasure();
    await quiesceExportHarSessionsForPrivacyErasure();
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
