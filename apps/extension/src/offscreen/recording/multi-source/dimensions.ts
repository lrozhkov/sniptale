export function requireRecordingDimensions(
  source: { trackSettings: MediaTrackSettings },
  unavailableMessage: string
): { height: number; width: number } {
  const { height, width } = source.trackSettings;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(unavailableMessage);
  }
  return { height, width };
}
