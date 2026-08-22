// policyStateIds: [] - disposable post-record popup delivery marker, not authorization authority.
const popupOwnedStopRecordingIds = new Set<string>();

export function markPostRecordPopupActivationOwnedByPopup(recordingId: string): void {
  popupOwnedStopRecordingIds.add(recordingId);
}

export function consumePostRecordPopupActivationOwnedByPopup(recordingId: string): boolean {
  const owned = popupOwnedStopRecordingIds.has(recordingId);
  popupOwnedStopRecordingIds.delete(recordingId);
  return owned;
}
