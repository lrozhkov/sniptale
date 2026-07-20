import { SCENARIO_V3_LIMITS } from './limits';
import { isStringLiteralValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { isBoundedString, isNumberInRange, isRecord, isScenarioV3Coordinate } from './value-guards';

const CAPTURE_TRIGGERS = ['keyboard-enter', 'pointer-up'] as const;

export function isCaptureContext(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isCaptureMetadata(value['captureMetadata']) &&
      isNullablePoint(value['cursorPoint']) &&
      isNullablePoint(value['interactionPoint']) &&
      isPageDescriptor(value['page']) &&
      isTargetDescriptor(value['target']))
  );
}

export function isPoint(value: unknown): boolean {
  return (
    isRecord(value) && isScenarioV3Coordinate(value['x']) && isScenarioV3Coordinate(value['y'])
  );
}

function isCaptureMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullablePointerRange(value['pointerRange']) &&
    isNullableScrollMetadata(value['scroll']) &&
    isEnumValue(value['trigger'], CAPTURE_TRIGGERS)
  );
}

function isNullablePointerRange(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      isPoint(value['start']) &&
      isPoint(value['end']) &&
      ['minX', 'minY', 'maxX', 'maxY', 'distance', 'durationMs'].every((field) =>
        isCaptureMetadataNumber(value[field])
      ))
  );
}

function isNullableScrollMetadata(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      ['startX', 'startY', 'endX', 'endY', 'deltaX', 'deltaY'].every((field) =>
        isCaptureMetadataNumber(value[field])
      ))
  );
}

function isPageDescriptor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableString(value['title']) &&
    isNullableString(value['url']) &&
    isRect(value['viewport']) &&
    isScenarioV3Coordinate(value['scrollX']) &&
    isScenarioV3Coordinate(value['scrollY']) &&
    isNumberInRange(value['devicePixelRatio'], 0.1, 10)
  );
}

function isTargetDescriptor(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      ['selector', 'iframeSelector', 'tagName', 'role', 'text', 'ariaLabel', 'title'].every(
        (field) => isNullableString(value[field])
      ) &&
      isNullableRect(value['rect']) &&
      isNullableFramePadding(value['framePadding']))
  );
}

function isNullableFramePadding(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) &&
      ['bottom', 'left', 'right', 'top'].every((field) =>
        isNumberInRange(value[field], 0, SCENARIO_V3_LIMITS.maxSafeAreaInset)
      ))
  );
}

function isNullableRect(value: unknown): boolean {
  return value === null || isRect(value);
}

function isRect(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberInRange(value['height'], 0, SCENARIO_V3_LIMITS.maxCanvasDimension * 4) &&
    isNumberInRange(value['width'], 0, SCENARIO_V3_LIMITS.maxCanvasDimension * 4) &&
    isScenarioV3Coordinate(value['x']) &&
    isScenarioV3Coordinate(value['y'])
  );
}

function isNullablePoint(value: unknown): boolean {
  return value === null || isPoint(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || isBoundedString(value, SCENARIO_V3_LIMITS.maxDescriptionLength);
}

function isCaptureMetadataNumber(value: unknown): boolean {
  return isNumberInRange(
    value,
    -SCENARIO_V3_LIMITS.maxCoordinate,
    SCENARIO_V3_LIMITS.maxCoordinate
  );
}

function isEnumValue<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[]
): value is TValue {
  return isStringLiteralValue(value, allowedValues);
}
