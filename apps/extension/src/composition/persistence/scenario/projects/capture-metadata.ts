import type {
  ScenarioCaptureMetadata,
  ScenarioPoint,
  ScenarioPointerRange,
  ScenarioScrollMetadata,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import {
  isScenarioCaptureMetadata,
  isScenarioPoint,
} from '../../../../contracts/messaging/scenario/validators';
import { isNumber, isRecord } from '../../../../contracts/messaging/validators';

function parsePoint(value: unknown): ScenarioPoint | null {
  return isScenarioPoint(value) ? value : null;
}

function parsePointerRange(value: unknown): ScenarioPointerRange | null {
  if (!isRecord(value)) {
    return null;
  }

  const start = parsePoint(value['start']);
  const end = parsePoint(value['end']);
  if (!start || !end) {
    return null;
  }

  return isNumber(value['minX']) &&
    isNumber(value['minY']) &&
    isNumber(value['maxX']) &&
    isNumber(value['maxY']) &&
    isNumber(value['distance']) &&
    isNumber(value['durationMs'])
    ? {
        start,
        end,
        minX: value['minX'],
        minY: value['minY'],
        maxX: value['maxX'],
        maxY: value['maxY'],
        distance: value['distance'],
        durationMs: value['durationMs'],
      }
    : null;
}

function parseScrollMetadata(value: unknown): ScenarioScrollMetadata | null {
  return isRecord(value) &&
    isNumber(value['startX']) &&
    isNumber(value['startY']) &&
    isNumber(value['endX']) &&
    isNumber(value['endY']) &&
    isNumber(value['deltaX']) &&
    isNumber(value['deltaY'])
    ? {
        startX: value['startX'],
        startY: value['startY'],
        endX: value['endX'],
        endY: value['endY'],
        deltaX: value['deltaX'],
        deltaY: value['deltaY'],
      }
    : null;
}

export function parseCaptureMetadataField(value: unknown): ScenarioCaptureMetadata {
  if (isScenarioCaptureMetadata(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return {
      pointerRange: null,
      scroll: null,
      trigger: 'pointer-up',
    };
  }

  return {
    pointerRange: parsePointerRange(value['pointerRange']),
    scroll: parseScrollMetadata(value['scroll']),
    trigger: value['trigger'] === 'keyboard-enter' ? 'keyboard-enter' : 'pointer-up',
  };
}
