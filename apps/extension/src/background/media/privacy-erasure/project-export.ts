import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import type { RuntimeMessagingTransport } from '../../../platform/runtime-messaging';

import {
  inspectActiveProjectExportJobLedgerEntry,
  requestProjectExportJobCancel,
  type ProjectExportJobLedgerInspection,
} from '../../../composition/persistence/export-ledger';
import {
  failed,
  failedExportParticipants,
  OFFSCREEN_EXPORT_PARTICIPANT_ID,
  PROJECT_EXPORT_PARTICIPANT_ID,
  verified,
  verifiedExportParticipants,
} from './result';

type ReadableProjectExportLedgerInspection = Extract<
  ProjectExportJobLedgerInspection,
  { status: 'absent' | 'entry' }
>;
type ProjectExportRuntimeTransport = Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'>;

function failedOffscreenExportParticipant(): readonly ErasureParticipantResult[] {
  return [
    verified(PROJECT_EXPORT_PARTICIPANT_ID),
    failed(OFFSCREEN_EXPORT_PARTICIPANT_ID, 'offscreen-export-cancel-failed'),
  ];
}

async function cancelOffscreenExport(
  jobId: string,
  transport: ProjectExportRuntimeTransport
): Promise<readonly ErasureParticipantResult[] | null> {
  try {
    const response = await transport.sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
        jobId,
      })
    );
    return response?.success === true && response.result === 'accepted'
      ? null
      : failedOffscreenExportParticipant();
  } catch {
    return failedOffscreenExportParticipant();
  }
}

async function verifyExportTerminalLedger(
  jobId: string
): Promise<readonly ErasureParticipantResult[]> {
  try {
    const terminalRead = await inspectActiveProjectExportJobLedgerEntry();
    if (
      terminalRead.status !== 'entry' ||
      terminalRead.entry.jobId !== jobId ||
      terminalRead.entry.status === 'running'
    ) {
      return failedExportParticipants('project-export-terminal-verification-failed');
    }
  } catch {
    return failedExportParticipants('project-export-terminal-verification-failed');
  }
  return verifiedExportParticipants();
}

export async function cleanupProjectExport(
  ledgerRead: ReadableProjectExportLedgerInspection,
  transport: ProjectExportRuntimeTransport
): Promise<readonly ErasureParticipantResult[]> {
  if (ledgerRead.status === 'absent' || ledgerRead.entry.status !== 'running') {
    return verifiedExportParticipants();
  }
  const ledger = ledgerRead.entry;

  let cancellation;
  try {
    cancellation = await requestProjectExportJobCancel(ledger.jobId);
  } catch {
    return failedExportParticipants('project-export-cancel-request-failed');
  }
  if (!cancellation || cancellation.jobId !== ledger.jobId) {
    return failedExportParticipants('project-export-cancel-request-failed');
  }
  if (cancellation.status === 'running' && !cancellation.cancelRequested) {
    return failedExportParticipants('project-export-cancel-not-durable');
  }

  if (cancellation.status === 'running') {
    const offscreenFailure = await cancelOffscreenExport(ledger.jobId, transport);
    if (offscreenFailure) return offscreenFailure;
  }

  return verifyExportTerminalLedger(ledger.jobId);
}
