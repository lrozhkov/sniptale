// policyStateIds: [] - effect modes and parser limits are immutable validation policy, not authority state.
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { FocusSettings } from '@sniptale/ui/highlighter-style/types';
import {
  FRAME_ANNOTATION_SNAPSHOT_VERSION,
  normalizeFrameAnnotationSnapshot,
  type FrameAnnotationSnapshotV1,
} from './model';
import {
  parseBorderSettings,
  parseBlurSettings,
  isCalloutSettings,
  normalizeCalloutSettings,
  isFocusSettings,
  isStepBadgeSettings,
} from './settings-parser';
import { MAX_FRAME_CALLOUTS } from './callout/collection';

const EFFECT_MODES = new Set(['border', 'blur', 'focus']);
const MAX_NESTING_DEPTH = 24;
const MAX_COLLECTION_ITEMS = 2_000;

export function parseFrameAnnotationSnapshot(value: unknown): FrameAnnotationSnapshotV1 | null {
  if (!isRecord(value) || value['version'] !== FRAME_ANNOTATION_SNAPSHOT_VERSION) return null;
  if (
    !isSafeId(value['id']) ||
    !Number.isSafeInteger(value['ordering']) ||
    Number(value['ordering']) < 0
  )
    return null;
  if (
    !isFiniteNumber(value['x']) ||
    !isFiniteNumber(value['y']) ||
    !isNonNegativeFinite(value['width']) ||
    !isNonNegativeFinite(value['height']) ||
    Math.abs(value['x']) > 131_072 ||
    Math.abs(value['y']) > 131_072 ||
    value['width'] > 32_768 ||
    value['height'] > 32_768
  ) {
    return null;
  }
  const effectMode = value['effectMode'];
  if (effectMode !== undefined && !EFFECT_MODES.has(effectMode as string)) return null;
  if (!isBoundedJsonRecord(value, 0, new Set())) return null;
  const borderSettings = parseBorderSettings(value['borderSettings']);
  const blurSettings = parseBlurSettings(value['blurSettings']);
  if (
    borderSettings === null ||
    blurSettings === null ||
    !isFocusSettings(value['focusSettings']) ||
    !isStepBadgeSettings(value['stepBadge']) ||
    !isCalloutSettings(value['callout']) ||
    !isAdditionalCallouts(value['additionalCallouts'])
  )
    return null;

  const primaryCallout = normalizeCalloutSettings(value['callout']);
  const additionalCallouts = Array.isArray(value['additionalCallouts'])
    ? (value['additionalCallouts'].map(normalizeCalloutSettings) as CalloutSettings[])
    : undefined;
  if (!primaryCallout && additionalCallouts?.length) return null;
  const snapshot: FrameAnnotationSnapshotV1 = {
    id: value['id'],
    version: FRAME_ANNOTATION_SNAPSHOT_VERSION,
    ordering: Number(value['ordering']),
    x: value['x'],
    y: value['y'],
    width: value['width'],
    height: value['height'],
    ...(effectMode === undefined ? {} : { effectMode: effectMode as 'border' | 'blur' | 'focus' }),
    ...(borderSettings === undefined ? {} : { borderSettings }),
    ...(blurSettings === undefined ? {} : { blurSettings }),
    ...(value['focusSettings'] === undefined
      ? {}
      : { focusSettings: value['focusSettings'] as FocusSettings }),
    ...(value['stepBadge'] === undefined
      ? {}
      : { stepBadge: value['stepBadge'] as StepBadgeSettings }),
    ...(primaryCallout == null ? {} : { callout: primaryCallout }),
    ...(additionalCallouts === undefined
      ? {}
      : {
          additionalCallouts,
        }),
  };
  return normalizeFrameAnnotationSnapshot(snapshot);
}

function isAdditionalCallouts(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= MAX_FRAME_CALLOUTS - 1 &&
      value.every(isCalloutSettings))
  );
}

export function serializeFrameAnnotationSnapshot(snapshot: FrameAnnotationSnapshotV1): string {
  return JSON.stringify(normalizeFrameAnnotationSnapshot(snapshot));
}

export function parseSerializedFrameAnnotationSnapshot(
  value: unknown
): FrameAnnotationSnapshotV1 | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_000_000) return null;
  try {
    return parseFrameAnnotationSnapshot(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function isBoundedJsonRecord(value: unknown, depth: number, seen: Set<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > MAX_NESTING_DEPTH || seen.has(value)) return false;
  seen.add(value);
  const entries = Array.isArray(value) ? value : Object.values(value);
  if (entries.length > MAX_COLLECTION_ITEMS) return false;
  const valid = entries.every((entry) => isBoundedJsonRecord(entry, depth + 1, seen));
  seen.delete(value);
  return valid;
}
