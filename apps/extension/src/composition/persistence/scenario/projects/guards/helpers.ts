import {
  createDefaultScenarioPageDescriptor,
  createDefaultScenarioViewport,
} from '../../../../../features/scenario/project/public';
import type {
  ScenarioImageTransform,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioRect,
  ScenarioTargetDescriptor,
  ScenarioViewportTransform,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import {
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioRect,
  isScenarioTargetDescriptor,
} from '../../../../../contracts/messaging/scenario/validators';
import { isNumber, isRecord, isString } from '../../../../../contracts/messaging/validators';

export function parseString(value: unknown, fallback = ''): string {
  return isString(value) ? value : fallback;
}

export function parseNumber(value: unknown, fallback: number): number {
  return isNumber(value) ? value : fallback;
}

export function parseNullableString(value: unknown): string | null {
  return value === null || isString(value) ? value : null;
}

export function parseBody(record: Record<string, unknown>): string {
  if (isString(record['body'])) {
    return record['body'];
  }

  if (isString(record['caption']) && record['caption'].trim()) {
    return record['caption'];
  }

  if (isString(record['subtitle'])) {
    return record['subtitle'];
  }

  return '';
}

export function parseRect(value: unknown): ScenarioRect | null {
  return isScenarioRect(value) ? value : null;
}

export function parsePoint(value: unknown): ScenarioPoint | null {
  return isScenarioPoint(value) ? value : null;
}

export function parseImageTransform(value: unknown): ScenarioImageTransform {
  if (
    !isRecord(value) ||
    !isNumber(value['scale']) ||
    !isNumber(value['x']) ||
    !isNumber(value['y'])
  ) {
    return {
      scale: 1,
      x: 0,
      y: 0,
    };
  }

  return {
    scale: value['scale'],
    x: value['x'],
    y: value['y'],
  };
}

export function parseViewportTransform(value: unknown): ScenarioViewportTransform {
  if (
    !isRecord(value) ||
    !isNumber(value['x']) ||
    !isNumber(value['y']) ||
    !isNumber(value['width']) ||
    !isNumber(value['height'])
  ) {
    return createDefaultScenarioViewport();
  }

  return {
    x: value['x'],
    y: value['y'],
    width: value['width'],
    height: value['height'],
  };
}

export function parseTargetDescriptor(value: unknown): ScenarioTargetDescriptor | null {
  return isScenarioTargetDescriptor(value) ? value : null;
}

export function parsePageDescriptor(value: unknown): ScenarioPageDescriptor {
  return isScenarioPageDescriptor(value) ? value : createDefaultScenarioPageDescriptor();
}
