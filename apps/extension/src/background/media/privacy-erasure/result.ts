import type { ErasureParticipantResult } from '@sniptale/runtime-contracts/privacy-erasure/types';

export const RECORDING_PARTICIPANT_ID = 'recording-runtime-state';
export const PROJECT_EXPORT_PARTICIPANT_ID = 'project-export-runtime-state';
export const OFFSCREEN_EXPORT_PARTICIPANT_ID = 'offscreen-export-runtime-state';

export function verified(id: string): ErasureParticipantResult {
  return {
    id,
    remainingCount: 0,
    severity: 'required',
    status: 'verified-empty',
  };
}

export function failed(id: string, error: string): ErasureParticipantResult {
  return {
    error,
    id,
    severity: 'required',
    status: 'failed',
  };
}

export function failedExportParticipants(error: string): readonly ErasureParticipantResult[] {
  return [
    failed(PROJECT_EXPORT_PARTICIPANT_ID, error),
    failed(OFFSCREEN_EXPORT_PARTICIPANT_ID, error),
  ];
}

export function verifiedExportParticipants(): readonly ErasureParticipantResult[] {
  return [verified(PROJECT_EXPORT_PARTICIPANT_ID), verified(OFFSCREEN_EXPORT_PARTICIPANT_ID)];
}
