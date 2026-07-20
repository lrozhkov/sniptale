import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../types/index';
import {
  isBoolean,
  isBoundedNumber,
  isBoundedString,
  isBoundedArray,
  isColorString,
  isCoordinate,
  isEnumValue,
  isNullable,
  isPoint,
  isPrimitiveRecord,
  isRecord,
  isRect,
  isScale,
  isString,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
} from './primitives';

function isCursorSkin(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['animationPreset'], VideoCursorAnimationPreset) &&
    isColorString(value['color']) &&
    isBoolean(value['hidden']) &&
    isEnumValue(value['preset'], VideoCursorVisualPreset) &&
    isScale(value['scale']) &&
    isBoolean(value['shadow'])
  );
}

function isCursorSample(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isBoundedNumber(value['time'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isCoordinate(value['x']) &&
    isCoordinate(value['y']) &&
    isBoolean(value['visible']) &&
    (value['interpolation'] === undefined ||
      isEnumValue(value['interpolation'], VideoTemporalEasing)) &&
    (value['skinOverride'] === undefined || isNullable(value['skinOverride'], isCursorSkin))
  );
}

export function isCursorTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['captureMode'], VideoCursorCaptureMode) &&
    isBoundedArray(value['samples'], isCursorSample) &&
    isCursorSkin(value['skin'])
  );
}

export function isActionEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isEnumValue(value['kind'], VideoProjectActionEventKind) &&
    isBoundedNumber(value['time'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isNullable(value['point'], isPoint) &&
    isBoundedString(value['label']) &&
    isPrimitiveRecord(value['data']) &&
    isEnumValue(value['preset'], VideoProjectActionPreset)
  );
}

export function isMotionRegion(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isBoundedNumber(value['startTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isEnumValue(value['easing'], VideoTemporalEasing) &&
    isEnumValue(value['focusMode'], VideoMotionFocusMode) &&
    isNullable(value['focusPoint'], isPoint) &&
    (value['focusArea'] === undefined || isNullable(value['focusArea'], isRect)) &&
    isScale(value['scale']) &&
    isNullable(value['targetActionEventId'], isString) &&
    isBoundedNumber(value['zoomInDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['zoomOutDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    (value['motionBlurAmount'] === undefined || isBoundedNumber(value['motionBlurAmount'], 0, 1)) &&
    (value['cameraMode'] === undefined ||
      isEnumValue(value['cameraMode'], VideoMotionCameraMode)) &&
    (value['overlayZoomMode'] === undefined ||
      isEnumValue(value['overlayZoomMode'], VideoMotionOverlayZoomMode))
  );
}
