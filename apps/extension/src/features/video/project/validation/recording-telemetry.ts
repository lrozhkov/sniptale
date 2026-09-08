import type {
  RecordingTelemetrySignal,
  RecordingViewportGeometry,
  RecordingViewportObservation,
  RecordingPointTransform,
  RecordingActionEvent,
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

export function isRecordingActionEvent(value: unknown): value is RecordingActionEvent {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['kind']) &&
    isNonNegativeNumber(value['time']) &&
    isNonNegativeNumber(value['duration']) &&
    isString(value['label']) &&
    isString(value['preset']) &&
    isRecord(value['data']) &&
    (value['recordingPoint'] === undefined ||
      value['recordingPoint'] === null ||
      isRecordingPoint(value['recordingPoint'])) &&
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
    (value['viewportObservation'] === undefined ||
      value['viewportObservation'] === null ||
      isRecordingViewportObservation(value['viewportObservation'])) &&
    (value['viewport'] === null || isViewportInfo(value['viewport'])) &&
    (value['cursorTrack'] === null || isVideoProjectCursorTrack(value['cursorTrack'])) &&
    Array.isArray(value['actionEvents']) &&
    value['actionEvents'].every(isRecordingActionEvent) &&
    (value['signals'] === undefined ||
      (Array.isArray(value['signals']) && value['signals'].every(isRecordingTelemetrySignal)))
  );
}

export function isRecordingPoint(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    isNumber(value['x']) &&
    isNumber(value['y']) &&
    Number.isFinite(value['x']) &&
    Number.isFinite(value['y']) &&
    value['x'] >= 0 &&
    value['x'] <= 1 &&
    value['y'] >= 0 &&
    value['y'] <= 1
  );
}

function isRecordingViewportGeometry(value: unknown): value is RecordingViewportGeometry {
  return (
    isRecord(value) &&
    ['width', 'height', 'devicePixelRatio', 'visualViewportScale'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0
    ) &&
    ['visualViewportOffsetX', 'visualViewportOffsetY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
    )
  );
}

function isRecordingViewportObservation(value: unknown): value is RecordingViewportObservation {
  return (
    isRecord(value) && isRecordingViewportGeometry(value['initial']) && isBoolean(value['stable'])
  );
}

export function isRecordingPointTransform(value: unknown): value is RecordingPointTransform {
  if (
    !isRecord(value) ||
    !isRecordingViewportGeometry(value['viewport']) ||
    !isRecord(value['visibleClientRect'])
  )
    return false;
  const viewport = value['viewport'];
  const rect = value['visibleClientRect'];
  return (
    viewport.visualViewportScale === 1 &&
    viewport.visualViewportOffsetX === 0 &&
    viewport.visualViewportOffsetY === 0 &&
    ['scaleX', 'scaleY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0
    ) &&
    ['offsetX', 'offsetY'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
    ) &&
    ['x', 'y', 'width', 'height'].every(
      (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key])
    ) &&
    Number(rect['x']) >= 0 &&
    Number(rect['y']) >= 0 &&
    Number(rect['width']) > 0 &&
    Number(rect['height']) > 0 &&
    Number(rect['x']) + Number(rect['width']) <= viewport.width &&
    Number(rect['y']) + Number(rect['height']) <= viewport.height
  );
}
