import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import { SCENARIO_V3_LIMITS } from './limits';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

export function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

export function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

export function isNullableBoundedString(value: unknown, maxLength: number): boolean {
  return value === null || isBoundedString(value, maxLength);
}

export function isScenarioV3Id(value: unknown): value is string {
  return isBoundedString(value, SCENARIO_V3_LIMITS.maxIdLength) && value.length > 0;
}

export function isScenarioV3Coordinate(value: unknown): value is number {
  return isNumberInRange(
    value,
    -SCENARIO_V3_LIMITS.maxCoordinate,
    SCENARIO_V3_LIMITS.maxCoordinate
  );
}

function isPositiveFrame(value: unknown): boolean {
  return (
    isRecord(value) &&
    isScenarioV3Coordinate(value['x']) &&
    isScenarioV3Coordinate(value['y']) &&
    isNumberInRange(value['width'], Number.MIN_VALUE, SCENARIO_V3_LIMITS.maxCanvasDimension * 4) &&
    value['width'] > 0 &&
    isNumberInRange(value['height'], Number.MIN_VALUE, SCENARIO_V3_LIMITS.maxCanvasDimension * 4) &&
    value['height'] > 0
  );
}

export function hasScenarioElementBaseFields(
  value: Record<string, unknown>,
  isSupportedElementKind: (kind: unknown) => kind is ScenarioElement['kind']
): boolean {
  return (
    isScenarioV3Id(value['id']) &&
    isSupportedElementKind(value['kind']) &&
    isBoundedString(value['name'], SCENARIO_V3_LIMITS.maxNameLength) &&
    isPositiveFrame(value['frame']) &&
    isNumberInRange(value['opacity'], 0, SCENARIO_V3_LIMITS.maxOpacity) &&
    typeof value['locked'] === 'boolean' &&
    typeof value['visible'] === 'boolean' &&
    (value['stylePresetId'] === undefined ||
      value['stylePresetId'] === null ||
      isBoundedString(value['stylePresetId'], SCENARIO_V3_LIMITS.maxIdLength))
  );
}
