import { VideoProjectExportPhase } from '../../../features/video/project/types';
import { isBoolean, isNumber, isRecord, isString } from '../infrastructure/guards/primitives';
import type { ProjectExportJobLedgerEntry, ProjectExportJobLedgerStatus } from './types';

const ledgerStatuses = new Set<ProjectExportJobLedgerStatus>([
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const exportPhases = new Set<string>(Object.values(VideoProjectExportPhase));

function isLedgerStatus(value: unknown): value is ProjectExportJobLedgerStatus {
  return isString(value) && ledgerStatuses.has(value as ProjectExportJobLedgerStatus);
}

function isExportPhase(value: unknown): value is VideoProjectExportPhase {
  return isString(value) && exportPhases.has(value);
}

export function parseProjectExportJobLedgerEntry(
  value: unknown
): ProjectExportJobLedgerEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const ownerSenderUrl = value['ownerSenderUrl'];
  const ownerDocumentId = value['ownerDocumentId'];

  if (
    !isString(value['jobId']) ||
    !isString(value['projectId']) ||
    (ownerSenderUrl !== undefined && ownerSenderUrl !== null && !isString(ownerSenderUrl)) ||
    (ownerDocumentId !== undefined && ownerDocumentId !== null && !isString(ownerDocumentId)) ||
    !isExportPhase(value['phase']) ||
    !isNumber(value['progress']) ||
    !isLedgerStatus(value['status']) ||
    !isNumber(value['startedAt']) ||
    !isNumber(value['updatedAt']) ||
    !isBoolean(value['cancelRequested']) ||
    (value['terminalError'] !== null && !isString(value['terminalError']))
  ) {
    return null;
  }

  return {
    jobId: value['jobId'],
    ownerDocumentId: ownerDocumentId ?? null,
    ownerSenderUrl: ownerSenderUrl ?? null,
    projectId: value['projectId'],
    phase: value['phase'],
    progress: value['progress'],
    status: value['status'],
    startedAt: value['startedAt'],
    updatedAt: value['updatedAt'],
    cancelRequested: value['cancelRequested'],
    terminalError: value['terminalError'],
  };
}
