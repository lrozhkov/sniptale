// policyStateIds: [] - native telemetry parser uses static privacy allowlists only.
import { isRecordingTelemetrySnapshot } from '../../features/video/project/validation/recording-telemetry';
import {
  VideoTemporalEasing,
  VideoCursorAnimationPreset,
  VideoCursorVisualPreset,
} from '../../features/video/project/types/interaction';
import { isBoolean, isFiniteNumber, isRecord, isString } from './parser-shared';
import type { NativeRecordingTelemetrySnapshot } from './types';

const isProjectRecordingTelemetrySnapshot = isRecordingTelemetrySnapshot;
const unsafeTelemetryKeyPattern =
  /(text|url|uri|cookie|auth|authorization|bearer|token|password|secret|clipboard|header)/i;
const unsafeTelemetryStringPattern =
  /(https?:\/\/|www\.|cookie=|authorization|bearer\s+|password|token|clipboard)/i;
const TELEMETRY_MAX_DEPTH = 8;
const TELEMETRY_MAX_NODES = 2_000;
const TELEMETRY_MAX_OBJECT_KEYS = 64;
const NATIVE_CURSOR_MAX_SAMPLES = 4096;
const nativeCursorSampleKeys = new Set([
  'id',
  'time',
  'x',
  'y',
  'visible',
  'recordingPoint',
  'observationClockId',
  'captureSegment',
  'observation',
  'interpolation',
  'interpolationRange',
  'skinOverride',
  'sourceAnchor',
  'timeBasis',
]);
const cursorSkinKeys = new Set(['animationPreset', 'color', 'hidden', 'preset', 'scale', 'shadow']);
const cursorEasingValues = new Set<string>(Object.values(VideoTemporalEasing));
const cursorAnimationValues = new Set<string>(Object.values(VideoCursorAnimationPreset));
const cursorVisualValues = new Set<string>(Object.values(VideoCursorVisualPreset));
const safeShortcutLabels = new Set([
  'Alt',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Backspace',
  'Ctrl',
  'Delete',
  'End',
  'Enter',
  'Escape',
  'Home',
  'Meta',
  'PageDown',
  'PageUp',
  'Shift',
  'Space',
  'Tab',
]);
const safeShortcutPattern =
  /^((Ctrl|Alt|Shift|Meta)\+){1,3}(Enter|Escape|Tab|Backspace|Delete|ArrowDown|ArrowLeft|ArrowRight|ArrowUp|[A-Z0-9])$/;

function isSafeTelemetryString(value: string): boolean {
  return value.length <= 120 && !unsafeTelemetryStringPattern.test(value);
}

function isSafeTelemetryRecord(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (budget.nodes > TELEMETRY_MAX_NODES || depth > TELEMETRY_MAX_DEPTH) {
    return false;
  }

  if (Array.isArray(value)) {
    return (
      value.length <= 256 && value.every((entry) => isSafeTelemetryRecord(entry, depth + 1, budget))
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return (
      entries.length <= TELEMETRY_MAX_OBJECT_KEYS &&
      entries.every(
        ([key, entry]) =>
          key.length <= 80 &&
          !unsafeTelemetryKeyPattern.test(key) &&
          isSafeTelemetryRecord(entry, depth + 1, budget)
      )
    );
  }
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (isString(value) && isSafeTelemetryString(value))
  );
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isNativeCursorSkinOverride(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      Object.keys(value).every((key) => cursorSkinKeys.has(key)) &&
      isString(value['color']) &&
      isBoolean(value['hidden']) &&
      isFiniteNumber(value['scale']) &&
      isBoolean(value['shadow']) &&
      (value['animationPreset'] === undefined ||
        (isString(value['animationPreset']) &&
          cursorAnimationValues.has(value['animationPreset']))) &&
      (value['preset'] === undefined ||
        (isString(value['preset']) && cursorVisualValues.has(value['preset']))))
  );
}

function isNativeCursorPresentation(value: Record<string, unknown>): boolean {
  const range = value['interpolationRange'];
  const anchor = value['sourceAnchor'];
  return (
    (value['interpolation'] === undefined ||
      (isString(value['interpolation']) && cursorEasingValues.has(value['interpolation']))) &&
    (range === undefined ||
      (isRecord(range) &&
        hasOnlyKeys(range, ['start', 'end']) &&
        isFiniteNumber(range['start']) &&
        isFiniteNumber(range['end']) &&
        range['start'] >= 0 &&
        range['end'] <= 1 &&
        range['end'] > range['start'])) &&
    (value['skinOverride'] === undefined || isNativeCursorSkinOverride(value['skinOverride'])) &&
    (anchor === undefined ||
      (isRecord(anchor) &&
        hasOnlyKeys(anchor, ['kind', 'recordingId', 'sourceClipId', 'sourceTime']) &&
        anchor['kind'] === 'recording-source' &&
        isString(anchor['recordingId']) &&
        isString(anchor['sourceClipId']) &&
        isFiniteNumber(anchor['sourceTime']) &&
        anchor['sourceTime'] >= 0)) &&
    (value['timeBasis'] === undefined || value['timeBasis'] === 'project')
  );
}

function isSafeNativeCursorSample(value: unknown): boolean {
  if (!isRecord(value) || !Object.keys(value).every((key) => nativeCursorSampleKeys.has(key)))
    return false;
  const point = value['recordingPoint'];
  return (
    (point === undefined ||
      point === null ||
      (isRecord(point) && hasOnlyKeys(point, ['x', 'y']))) &&
    isNativeCursorPresentation(value) &&
    isSafeTelemetryRecord(value)
  );
}

function isSafeNativeCursorTrack(
  value: NonNullable<NativeRecordingTelemetrySnapshot['cursorTrack']>
): boolean {
  const { samples, ...metadata } = value;
  // The project schema validates required sample fields before this privacy gate.
  return (
    samples.length <= NATIVE_CURSOR_MAX_SAMPLES &&
    isSafeTelemetryRecord(metadata) &&
    samples.every(isSafeNativeCursorSample)
  );
}

function isSafeKeyLabel(value: unknown): boolean {
  return isString(value) && (safeShortcutLabels.has(value) || safeShortcutPattern.test(value));
}

function isNativeTelemetryPrivacySafe(value: NativeRecordingTelemetrySnapshot): boolean {
  return (
    value.actionEvents.every(
      (event) =>
        isSafeTelemetryString(event.id) &&
        isSafeTelemetryString(event.kind) &&
        isSafeTelemetryString(event.label) &&
        isSafeTelemetryString(event.preset) &&
        isSafeTelemetryRecord(event.data) &&
        (event.kind !== 'KEY' || isSafeKeyLabel(event.label))
    ) &&
    value.signals.every(
      (signal) =>
        isSafeTelemetryString(signal.id) &&
        isSafeTelemetryString(signal.kind) &&
        isSafeTelemetryRecord(signal.data)
    ) &&
    (value.cursorTrack === null || isSafeNativeCursorTrack(value.cursorTrack)) &&
    (value.viewport === null || isSafeTelemetryRecord(value.viewport))
  );
}

export function isNativeTelemetrySnapshot(
  value: unknown
): value is NativeRecordingTelemetrySnapshot | null {
  if (value === null) {
    return true;
  }
  return (
    isProjectRecordingTelemetrySnapshot(value) &&
    isNativeTelemetryPrivacySafe(value as NativeRecordingTelemetrySnapshot)
  );
}
