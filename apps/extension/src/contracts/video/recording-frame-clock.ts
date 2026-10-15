/** Advisory native clock metadata with a measured error bound; never primary command authority. */
export type RecordingFrameClockBinding = Readonly<{
  generation: number;
  recordingId: string;
  streamInstanceId: string;
}>;

export type RecordingFrameClockAnchor = RecordingFrameClockBinding &
  Readonly<{
    revision: number;
    phase: 'active' | 'paused';
    captureEpochMs: number;
    /** Admitted timing error after native metadata and cross-context translation. */
    uncertaintyMs?: number;
    maximumUncertaintyMs?: number;
    previousMediaTimeSeconds?: number;
    mediaTimeSeconds: number;
  }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function isBinding(value: Record<string, unknown>): boolean {
  return (
    isIdentifier(value['recordingId']) &&
    isIdentifier(value['streamInstanceId']) &&
    Number.isSafeInteger(value['generation']) &&
    Number(value['generation']) >= 0
  );
}

export function matchesRecordingFrameClockBinding(
  left: RecordingFrameClockBinding,
  right: RecordingFrameClockBinding
): boolean {
  return (
    left.recordingId === right.recordingId &&
    left.generation === right.generation &&
    left.streamInstanceId === right.streamInstanceId
  );
}

export function isRecordingFrameClockAnchor(value: unknown): value is RecordingFrameClockAnchor {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'recordingId',
      'generation',
      'streamInstanceId',
      'revision',
      'phase',
      'captureEpochMs',
      'uncertaintyMs',
      'maximumUncertaintyMs',
      'previousMediaTimeSeconds',
      'mediaTimeSeconds',
    ]) &&
    isBinding(value) &&
    Number.isSafeInteger(value['revision']) &&
    Number(value['revision']) > 0 &&
    (value['phase'] === 'active' || value['phase'] === 'paused') &&
    typeof value['captureEpochMs'] === 'number' &&
    Number.isFinite(value['captureEpochMs']) &&
    value['captureEpochMs'] > 0 &&
    (value['uncertaintyMs'] === undefined ||
      (typeof value['uncertaintyMs'] === 'number' &&
        Number.isFinite(value['uncertaintyMs']) &&
        value['uncertaintyMs'] >= 0)) &&
    (value['maximumUncertaintyMs'] === undefined ||
      (typeof value['maximumUncertaintyMs'] === 'number' &&
        Number.isFinite(value['maximumUncertaintyMs']) &&
        value['maximumUncertaintyMs'] > 0 &&
        value['maximumUncertaintyMs'] <= 1000)) &&
    (value['previousMediaTimeSeconds'] === undefined ||
      (typeof value['previousMediaTimeSeconds'] === 'number' &&
        Number.isFinite(value['previousMediaTimeSeconds']) &&
        value['previousMediaTimeSeconds'] >= 0)) &&
    typeof value['mediaTimeSeconds'] === 'number' &&
    Number.isFinite(value['mediaTimeSeconds']) &&
    value['mediaTimeSeconds'] >= 0 &&
    (value['previousMediaTimeSeconds'] === undefined ||
      (typeof value['previousMediaTimeSeconds'] === 'number' &&
        value['previousMediaTimeSeconds'] <= value['mediaTimeSeconds']))
  );
}

export function isOptionalRecordingFrameClockAnchor(value: unknown): boolean {
  return value === null || isRecordingFrameClockAnchor(value);
}

/** Read-only timing from the active native encoder owner's monotonic epoch domain. */
export type RecordingClockTiming = RecordingFrameClockBinding &
  Readonly<{
    receivedAtMs: number;
    repliedAtMs: number;
    maximumUncertaintyMs: number;
  }>;
export function isRecordingFrameClockBinding(value: unknown): value is RecordingFrameClockBinding {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['recordingId', 'generation', 'streamInstanceId']) &&
    isBinding(value)
  );
}
export function isRecordingClockTiming(value: unknown): value is RecordingClockTiming {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'recordingId',
      'generation',
      'streamInstanceId',
      'receivedAtMs',
      'repliedAtMs',
      'maximumUncertaintyMs',
    ]) &&
    isBinding(value) &&
    typeof value['receivedAtMs'] === 'number' &&
    Number.isFinite(value['receivedAtMs']) &&
    typeof value['repliedAtMs'] === 'number' &&
    Number.isFinite(value['repliedAtMs']) &&
    value['repliedAtMs'] >= value['receivedAtMs'] &&
    typeof value['maximumUncertaintyMs'] === 'number' &&
    Number.isFinite(value['maximumUncertaintyMs']) &&
    value['maximumUncertaintyMs'] > 0 &&
    value['maximumUncertaintyMs'] <= 1000
  );
}
