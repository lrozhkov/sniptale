import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';

/** Bounded acquisition facts retained with an export; no event contents or source identifiers. */
export interface RecordingMetadata {
  captureMode: CaptureMode | null;
  displaySurface: VideoDisplaySurface | null;
  actionCount: number;
  hasPointer: boolean;
}

/** Parses a frozen snapshot at storage and backup boundaries, discarding unrelated fields. */
export function parseRecordingMetadata(value: unknown): RecordingMetadata | null {
  if (!isRecord(value)) return null;
  const captureMode = value['captureMode'];
  const displaySurface = value['displaySurface'];
  const actionCount = value['actionCount'];
  if (
    (captureMode !== null &&
      captureMode !== CaptureMode.SCREEN &&
      captureMode !== CaptureMode.TAB &&
      captureMode !== CaptureMode.TAB_CROP &&
      captureMode !== CaptureMode.CAMERA) ||
    (displaySurface !== null &&
      displaySurface !== VideoDisplaySurface.BROWSER &&
      displaySurface !== VideoDisplaySurface.WINDOW &&
      displaySurface !== VideoDisplaySurface.MONITOR) ||
    typeof actionCount !== 'number' ||
    !Number.isSafeInteger(actionCount) ||
    actionCount < 0 ||
    typeof value['hasPointer'] !== 'boolean'
  )
    return null;
  return { captureMode, displaySurface, actionCount, hasPointer: value['hasPointer'] };
}

/** Creates only the inspector's supported facts from already validated native telemetry. */
export function summarizeRecordingMetadata(entry: {
  captureMode: CaptureMode | null;
  displaySurface?: VideoDisplaySurface | null;
  actionEvents: readonly unknown[];
  cursorTrack: { samples: readonly unknown[] } | null;
}): RecordingMetadata {
  return {
    captureMode: entry.captureMode,
    displaySurface: entry.displaySurface ?? null,
    actionCount: entry.actionEvents.length,
    hasPointer: Boolean(entry.cursorTrack?.samples.length),
  };
}
