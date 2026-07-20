import type {
  ErasureParticipantResult,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';

export function createFailedCleanupParticipant(
  id: string,
  error: string
): ErasureParticipantResult {
  return {
    error,
    id,
    severity: 'required',
    status: 'failed',
  };
}

export function hasRequiredCleanupFailure(
  participants: readonly ErasureParticipantResult[]
): boolean {
  return participants.some(
    (participant) => participant.severity === 'required' && participant.status !== 'verified-empty'
  );
}

function getFailedRequiredParticipantIds(
  participants: readonly ErasureParticipantResult[]
): string[] {
  return participants
    .filter(
      (participant) =>
        participant.severity === 'required' && participant.status !== 'verified-empty'
    )
    .map((participant) => participant.id);
}

export function createShortCircuitedErasureResult(
  participants: readonly ErasureParticipantResult[]
): LocalExtensionDataErasureResult {
  const failedRequiredParticipantIds = getFailedRequiredParticipantIds(participants);
  return {
    failedRequiredParticipantIds,
    indexedDbStoresCleared: 0,
    localStorageKeysRemoved: [],
    participants: [...participants],
    sessionStorageKeysRemoved: [],
    success: failedRequiredParticipantIds.length === 0,
    syncStorageKeysRemoved: [],
  };
}

export function mergeCleanupResults(
  ownerParticipants: readonly ErasureParticipantResult[],
  storageResult: LocalExtensionDataErasureResult
): LocalExtensionDataErasureResult {
  const participants = [...ownerParticipants, ...storageResult.participants];
  const failedRequiredParticipantIds = getFailedRequiredParticipantIds(participants);
  return {
    ...storageResult,
    failedRequiredParticipantIds,
    participants,
    success: failedRequiredParticipantIds.length === 0,
  };
}
