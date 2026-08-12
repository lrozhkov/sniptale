import type {
  RecordingTelemetrySignal,
  VideoProjectActionEvent,
  VideoProjectCursorTrack,
} from '../types';
import {
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';

type RecordingTelemetryViewportInfo = {
  devicePixelRatio: number;
  height: number;
  outerHeight?: number;
  outerWidth?: number;
  scrollX: number;
  scrollY: number;
  viewportOffsetX?: number;
  viewportOffsetY?: number;
  visualViewportScale?: number;
  width: number;
};

function hasOptionalField<TRecord extends Record<string, unknown>>(
  record: TRecord,
  key: string,
  validator: (value: unknown) => boolean
): boolean {
  return record[key] === undefined || validator(record[key]);
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isNumber(value['x']) && isNumber(value['y']);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

export function isViewportInfo(value: unknown): value is RecordingTelemetryViewportInfo {
  return (
    isRecord(value) &&
    isNumber(value['width']) &&
    value['width'] > 0 &&
    isNumber(value['height']) &&
    value['height'] > 0 &&
    isNumber(value['scrollX']) &&
    isNumber(value['scrollY']) &&
    isNumber(value['devicePixelRatio']) &&
    value['devicePixelRatio'] > 0 &&
    hasOptionalField(value, 'outerWidth', isNumber) &&
    hasOptionalField(value, 'outerHeight', isNumber) &&
    hasOptionalField(value, 'viewportOffsetX', isNumber) &&
    hasOptionalField(value, 'viewportOffsetY', isNumber) &&
    hasOptionalField(value, 'visualViewportScale', isNumber)
  );
}

export function isVideoProjectCursorTrack(value: unknown): value is VideoProjectCursorTrack {
  return (
    isRecord(value) &&
    isString(value['captureMode']) &&
    isRecord(value['skin']) &&
    hasOptionalField(value['skin'], 'animationPreset', isString) &&
    isString(value['skin']['color']) &&
    isBoolean(value['skin']['hidden']) &&
    hasOptionalField(value['skin'], 'preset', isString) &&
    isNumber(value['skin']['scale']) &&
    isBoolean(value['skin']['shadow']) &&
    Array.isArray(value['samples']) &&
    value['samples'].every(
      (sample) =>
        isRecord(sample) &&
        isString(sample['id']) &&
        isNonNegativeNumber(sample['time']) &&
        isNumber(sample['x']) &&
        isNumber(sample['y']) &&
        isBoolean(sample['visible'])
    )
  );
}

export function isVideoProjectActionEvent(value: unknown): value is VideoProjectActionEvent {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['kind']) &&
    isNonNegativeNumber(value['time']) &&
    isNonNegativeNumber(value['duration']) &&
    isString(value['label']) &&
    isString(value['preset']) &&
    isRecord(value['data']) &&
    (value['point'] === null || isPoint(value['point']))
  );
}

export function isRecordingTelemetrySignal(value: unknown): value is RecordingTelemetrySignal {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['kind']) &&
    isNonNegativeNumber(value['startTime']) &&
    isNonNegativeNumber(value['endTime']) &&
    value['endTime'] >= value['startTime'] &&
    isRecord(value['data']) &&
    (value['point'] === null || isPoint(value['point']))
  );
}

export function isRecordingTelemetrySnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['viewport'] === null || isViewportInfo(value['viewport'])) &&
    (value['cursorTrack'] === null || isVideoProjectCursorTrack(value['cursorTrack'])) &&
    Array.isArray(value['actionEvents']) &&
    value['actionEvents'].every(isVideoProjectActionEvent) &&
    (value['signals'] === undefined ||
      (Array.isArray(value['signals']) && value['signals'].every(isRecordingTelemetrySignal)))
  );
}
