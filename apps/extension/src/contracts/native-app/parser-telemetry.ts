// policyStateIds: [] - native telemetry parser uses static privacy allowlists only.
import { isRecordingTelemetrySnapshot } from '../../features/video/project/validation/recording-telemetry';
import { isRecord, isString } from './parser-shared';
import type { NativeRecordingTelemetrySnapshot } from './types';

const isProjectRecordingTelemetrySnapshot = isRecordingTelemetrySnapshot;
const unsafeTelemetryKeyPattern =
  /(text|url|uri|cookie|auth|authorization|bearer|token|password|secret|clipboard|header)/i;
const unsafeTelemetryStringPattern =
  /(https?:\/\/|www\.|cookie=|authorization|bearer\s+|password|token|clipboard)/i;
const TELEMETRY_MAX_DEPTH = 8;
const TELEMETRY_MAX_NODES = 2_000;
const TELEMETRY_MAX_OBJECT_KEYS = 64;
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
    (value.cursorTrack === null || isSafeTelemetryRecord(value.cursorTrack)) &&
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
