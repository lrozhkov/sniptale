import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

import {
  inspectActiveProjectExportJobLedgerEntry,
  type ProjectExportJobLedgerInspection,
} from '../../../composition/persistence/export-ledger';
import { sendRuntimeMessage } from '../../../platform/runtime-messaging';
import { inspectPersistedLease } from '../../storage/video/recording-control-lease';
import type { PersistedLeaseInspection } from '../../storage/video/recording-control-lease';
import { reserveMediaErasureExclusion } from '../../mutation-exclusion/media-activity';
import { closeOffscreenDocumentForPrivacyErasure } from '../../offscreen-document/service';
import { cleanupProjectExport } from './project-export';
import { cleanupRecording } from './recording';
import { recoverInvalidDurableMediaState } from './recovery';
import {
  failed,
  failedExportParticipants,
  RECORDING_PARTICIPANT_ID,
  verified,
  VOICE_INPUT_PARTICIPANT_ID,
} from './result';
import { cleanupVoiceInputForPrivacyErasure } from '../../voice-input/coordinator';

export const mediaPrivacyErasureCleanupAdapter = {
  reserveErasureExclusion: reserveMediaErasureExclusion,
  async cleanup(): Promise<readonly ErasureParticipantResult[]> {
    let voiceInputResult: ErasureParticipantResult;
    try {
      voiceInputResult = (await cleanupVoiceInputForPrivacyErasure())
        ? verified(VOICE_INPUT_PARTICIPANT_ID)
        : failed(VOICE_INPUT_PARTICIPANT_ID, 'voice-input-stop-failed');
    } catch {
      voiceInputResult = failed(VOICE_INPUT_PARTICIPANT_ID, 'voice-input-stop-failed');
    }
    let persistedLease: PersistedLeaseInspection;
    let exportLedger: ProjectExportJobLedgerInspection;
    try {
      [persistedLease, exportLedger] = await Promise.all([
        inspectPersistedLease(),
        inspectActiveProjectExportJobLedgerEntry(),
      ]);
    } catch {
      return [
        voiceInputResult,
        failed(RECORDING_PARTICIPANT_ID, 'media-authority-read-failed'),
        ...failedExportParticipants('media-authority-read-failed'),
      ];
    }

    if (persistedLease.status === 'unavailable' || exportLedger.status === 'unavailable') {
      return [
        voiceInputResult,
        failed(RECORDING_PARTICIPANT_ID, 'media-authority-read-unavailable'),
        ...failedExportParticipants('media-authority-read-unavailable'),
      ];
    }
    if (persistedLease.status === 'invalid' || exportLedger.status === 'invalid') {
      return [voiceInputResult, ...(await recoverInvalidDurableMediaState())];
    }

    const [recording, projectExport] = await Promise.all([
      cleanupRecording().catch(() => failed(RECORDING_PARTICIPANT_ID, 'recording-stop-failed')),
      cleanupProjectExport(exportLedger, { sendRuntimeMessage }),
    ]);
    const mediaResults = [recording, ...projectExport];
    const results = [voiceInputResult, ...mediaResults];
    try {
      await closeOffscreenDocumentForPrivacyErasure();
      return results;
    } catch {
      return [
        voiceInputResult,
        failed(RECORDING_PARTICIPANT_ID, 'offscreen-media-close-failed'),
        ...projectExport,
      ];
    }
  },
};
