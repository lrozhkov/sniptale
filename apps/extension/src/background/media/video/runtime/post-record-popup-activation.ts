import { getVideoRecordingRuntimeState } from './session-state';
// policyStateIds: [] - disposable post-record popup delivery marker, not authorization authority.
const popupOwnedStopRecordingIds = new Set<string>();

export function markPostRecordPopupActivationOwnedByPopup(recordingId: string): void {
  // Restoring a resized window dismisses the existing action popup. Completion must reopen it.
  if (getVideoRecordingRuntimeState().viewportPresetId) return;
  popupOwnedStopRecordingIds.add(recordingId);
}

export function consumePostRecordPopupActivationOwnedByPopup(recordingId: string): boolean {
  const owned = popupOwnedStopRecordingIds.has(recordingId);
  popupOwnedStopRecordingIds.delete(recordingId);
  return owned;
}
