import type { ScenarioCaptureMetadata } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type {
  ScenarioCaptureMode,
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
  ScenarioSuggestedEventKind,
} from '@sniptale/runtime-contracts/scenario/types/base';
import {
  isCaptureActionTypeValue,
  type CaptureActionType,
} from '@sniptale/runtime-contracts/capture/action';
import {
  hasOptionalField,
  isBoolean,
  isNullable,
  isRecord,
  isString,
} from '../../validators/index';
import { isScenarioPointerRange, isScenarioScrollMetadata } from './geometry';

const scenarioCaptureModeValues = new Set<ScenarioCaptureMode>(['manual', 'by-click']);
const scenarioCaptureSurfaceValues = new Set<ScenarioCaptureSurface>([
  'visible',
  'full',
  'selection',
]);
const scenarioCaptureSourceKindValues = new Set<ScenarioCaptureSourceKind>([
  'manual',
  'auto-click',
]);
const scenarioSuggestedEventKindValues = new Set<ScenarioSuggestedEventKind>([
  'click',
  'input',
  'change',
  'keydown',
  'scroll',
]);

export function isScenarioCaptureMode(value: unknown): value is ScenarioCaptureMode {
  return isString(value) && scenarioCaptureModeValues.has(value as ScenarioCaptureMode);
}

export function isScenarioCaptureSurface(value: unknown): value is ScenarioCaptureSurface {
  return isString(value) && scenarioCaptureSurfaceValues.has(value as ScenarioCaptureSurface);
}

export function isScenarioCaptureSourceKind(value: unknown): value is ScenarioCaptureSourceKind {
  return isString(value) && scenarioCaptureSourceKindValues.has(value as ScenarioCaptureSourceKind);
}

export function isScenarioSuggestedEventKind(value: unknown): value is ScenarioSuggestedEventKind {
  return (
    isString(value) && scenarioSuggestedEventKindValues.has(value as ScenarioSuggestedEventKind)
  );
}

function isScenarioCaptureAction(value: unknown): value is CaptureActionType {
  return isCaptureActionTypeValue(value);
}

export function isScenarioCaptureMetadata(value: unknown): value is ScenarioCaptureMetadata {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'pointerRange', isNullable(isScenarioPointerRange)) &&
    hasOptionalField(value, 'scroll', isNullable(isScenarioScrollMetadata)) &&
    (value['trigger'] === 'pointer-up' || value['trigger'] === 'keyboard-enter')
  );
}

export function isScenarioStringDataRecord(
  value: unknown
): value is Record<string, string | number | boolean | null> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => item === null || isString(item) || typeof item === 'number' || isBoolean(item)
  );
}

export {
  isScenarioFramePadding,
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioPointerRange,
  isScenarioRect,
  isScenarioTargetDescriptor,
} from './geometry';

export function isScenarioRecorderCaptureAction(value: unknown) {
  return isScenarioCaptureAction(value);
}
