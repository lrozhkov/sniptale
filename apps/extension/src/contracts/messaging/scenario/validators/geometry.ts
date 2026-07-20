import type {
  ScenarioFramePadding,
  ScenarioPageDescriptor,
  ScenarioPointerRange,
  ScenarioPoint,
  ScenarioRect,
  ScenarioScrollMetadata,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { hasOptionalField, isNullable, isNumber, isRecord, isString } from '../../validators/index';

export function isScenarioPoint(value: unknown): value is ScenarioPoint {
  return isRecord(value) && isNumber(value['x']) && isNumber(value['y']);
}

export function isScenarioPointerRange(value: unknown): value is ScenarioPointerRange {
  return (
    isRecord(value) &&
    isScenarioPoint(value['start']) &&
    isScenarioPoint(value['end']) &&
    isNumber(value['minX']) &&
    isNumber(value['minY']) &&
    isNumber(value['maxX']) &&
    isNumber(value['maxY']) &&
    isNumber(value['distance']) &&
    isNumber(value['durationMs'])
  );
}

export function isScenarioRect(value: unknown): value is ScenarioRect {
  return (
    isRecord(value) &&
    isNumber(value['x']) &&
    isNumber(value['y']) &&
    isNumber(value['width']) &&
    isNumber(value['height'])
  );
}

export function isScenarioFramePadding(value: unknown): value is ScenarioFramePadding {
  return (
    isRecord(value) &&
    isNumber(value['top']) &&
    isNumber(value['left']) &&
    isNumber(value['right']) &&
    isNumber(value['bottom'])
  );
}

export function isScenarioScrollMetadata(value: unknown): value is ScenarioScrollMetadata {
  return (
    isRecord(value) &&
    isNumber(value['startX']) &&
    isNumber(value['startY']) &&
    isNumber(value['endX']) &&
    isNumber(value['endY']) &&
    isNumber(value['deltaX']) &&
    isNumber(value['deltaY'])
  );
}

export function isScenarioPageDescriptor(value: unknown): value is ScenarioPageDescriptor {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'title', isNullable(isString)) &&
    hasOptionalField(value, 'url', isNullable(isString)) &&
    isScenarioRect(value['viewport']) &&
    isNumber(value['scrollX']) &&
    isNumber(value['scrollY']) &&
    isNumber(value['devicePixelRatio'])
  );
}

export function isScenarioTargetDescriptor(value: unknown): value is ScenarioTargetDescriptor {
  return (
    isRecord(value) &&
    hasOptionalField(value, 'selector', isNullable(isString)) &&
    hasOptionalField(value, 'iframeSelector', isNullable(isString)) &&
    hasOptionalField(value, 'tagName', isNullable(isString)) &&
    hasOptionalField(value, 'role', isNullable(isString)) &&
    hasOptionalField(value, 'text', isNullable(isString)) &&
    hasOptionalField(value, 'ariaLabel', isNullable(isString)) &&
    hasOptionalField(value, 'title', isNullable(isString)) &&
    hasOptionalField(value, 'rect', isNullable(isScenarioRect)) &&
    hasOptionalField(value, 'framePadding', isNullable(isScenarioFramePadding))
  );
}
