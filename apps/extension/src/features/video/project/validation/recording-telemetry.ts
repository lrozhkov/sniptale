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

export function isViewportInfo(value: unknown): value is RecordingTelemetryViewportInfo {
  return (
    isRecord(value) &&
    isNumber(value['width']) &&
    isNumber(value['height']) &&
    isNumber(value['scrollX']) &&
    isNumber(value['scrollY']) &&
    isNumber(value['devicePixelRatio']) &&
    hasOptionalField(value, 'outerWidth', isNumber) &&
    hasOptionalField(value, 'outerHeight', isNumber) &&
    hasOptionalField(value, 'viewportOffsetX', isNumber) &&
    hasOptionalField(value, 'viewportOffsetY', isNumber)
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
        isNumber(sample['time']) &&
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
    isNumber(value['time']) &&
    isNumber(value['duration']) &&
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
    isNumber(value['startTime']) &&
    isNumber(value['endTime']) &&
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
