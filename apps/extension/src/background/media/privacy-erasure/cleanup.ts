import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import {
  inspectActiveProjectExportJobLedgerEntry,
  type ProjectExportJobLedgerInspection,
} from '../../../composition/persistence/export-ledger';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import type { PersistedLeaseInspection } from '../../storage/video/recording-control-lease';
import { reserveMediaErasureExclusion } from '../lifecycle-gate';
import { closeOffscreenDocumentForPrivacyErasure } from '../video/runtime/offscreen-manager';
import { cleanupProjectExport } from './project-export';
import { cleanupRecording } from './recording';
import { recoverInvalidDurableMediaState } from './recovery';
import { failed, failedExportParticipants, RECORDING_PARTICIPANT_ID } from './result';

export const mediaPrivacyErasureCleanupAdapter = {
  reserveErasureExclusion: reserveMediaErasureExclusion,
  async cleanup(): Promise<readonly ErasureParticipantResult[]> {
    let persistedLease: PersistedLeaseInspection;
    let exportLedger: ProjectExportJobLedgerInspection;
    try {
      [persistedLease, exportLedger] = await Promise.all([
        inspectPersistedLease(),
        inspectActiveProjectExportJobLedgerEntry(),
      ]);
    } catch {
      return [
        failed(RECORDING_PARTICIPANT_ID, 'media-authority-read-failed'),
        ...failedExportParticipants('media-authority-read-failed'),
      ];
    }

    if (persistedLease.status === 'unavailable' || exportLedger.status === 'unavailable') {
      return [
        failed(RECORDING_PARTICIPANT_ID, 'media-authority-read-unavailable'),
        ...failedExportParticipants('media-authority-read-unavailable'),
      ];
    }
    if (persistedLease.status === 'invalid' || exportLedger.status === 'invalid') {
      return recoverInvalidDurableMediaState();
    }

    const [recording, projectExport] = await Promise.all([
      cleanupRecording(),
      cleanupProjectExport(exportLedger, { sendRuntimeMessage }),
    ]);
    const results = [recording, ...projectExport];
    if (results.some((result) => result.severity === 'required' && result.status === 'failed')) {
      return results;
    }

    try {
      await closeOffscreenDocumentForPrivacyErasure();
      return results;
    } catch {
      return [failed(RECORDING_PARTICIPANT_ID, 'offscreen-media-close-failed'), ...projectExport];
    }
  },
};
