import { isActionClickStyle, isActionKeyStyle } from './action-style';
import { isMotionAnimation } from '../motion/timing';
import { parseMotionSourceBinding } from '../motion/source-binding';
import {
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectInteractionTimeBasis,
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

function isSourceTimeAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    value['kind'] === 'recording-source' &&
    isString(value['recordingId']) &&
    isString(value['sourceClipId']) &&
    isBoundedNumber(value['sourceTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS)
  );
}

function isCursorSample(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['interpolationRange'] === undefined ||
      (isRecord(value['interpolationRange']) &&
        isBoundedNumber(value['interpolationRange']['start'], 0, 1) &&
        isBoundedNumber(value['interpolationRange']['end'], 0, 1) &&
        value['interpolationRange']['end'] > value['interpolationRange']['start'])) &&
    isString(value['id']) &&
    isBoundedNumber(value['time'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isCoordinate(value['x']) &&
    isCoordinate(value['y']) &&
    isBoolean(value['visible']) &&
    (value['sourceAnchor'] === undefined || isSourceTimeAnchor(value['sourceAnchor'])) &&
    (value['timeBasis'] === undefined ||
      isEnumValue(value['timeBasis'], VideoProjectInteractionTimeBasis)) &&
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

function isActionIdentity(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isActionAnchor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value['kind'] === 'project')
    return isBoundedNumber(value['time'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS);
  return (
    value['kind'] === 'recording-source' &&
    isActionIdentity(value['recordingId']) &&
    isActionIdentity(value['sourceInstanceId']) &&
    isActionIdentity(value['sourceEventId']) &&
    isBoundedNumber(value['sourceTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS)
  );
}

export function isActionEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    !['time', 'duration', 'preset', 'sourceAnchor', 'timeBasis', 'animation'].some(
      (key) => key in value
    ) &&
    isActionIdentity(value['id']) &&
    isActionAnchor(value['anchor']) &&
    isEnumValue(value['kind'], VideoProjectActionEventKind) &&
    isBoundedString(value['label']) &&
    isPrimitiveRecord(value['data']) &&
    isNullable(value['point'], isPoint) &&
    (value['capturedDuration'] === undefined ||
      isBoundedNumber(value['capturedDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS)) &&
    (value['presentation'] === undefined ||
      isVideoProjectActionPresentationOverride(value['presentation'])) &&
    (!isRecord(value['anchor']) ||
      value['anchor']['kind'] !== 'recording-source' ||
      ((value['point'] === null || isNormalizedActionPoint(value['point'])) &&
        (!isRecord(value['presentation']) ||
          value['presentation']['point'] === undefined ||
          isNormalizedActionPoint(value['presentation']['point']))))
  );
}

function isNormalizedActionPoint(value: unknown): boolean {
  return isRecord(value) && isBoundedNumber(value['x'], 0, 1) && isBoundedNumber(value['y'], 0, 1);
}

function isPresentationDuration(value: unknown): boolean {
  return (
    isBoundedNumber(value, 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    typeof value === 'number' &&
    value > 0
  );
}

function isPresentationOffset(value: unknown): boolean {
  return isBoundedNumber(
    value,
    -MAX_VIDEO_PROJECT_DURATION_SECONDS,
    MAX_VIDEO_PROJECT_DURATION_SECONDS
  );
}

export function isVideoProjectActionPresentation(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['clickStyle'] === undefined || isActionClickStyle(value['clickStyle'])) &&
    (value['keyStyle'] === undefined || isActionKeyStyle(value['keyStyle'])) &&
    (value['easing'] === undefined || isEnumValue(value['easing'], VideoTemporalEasing)) &&
    isBoolean(value['enabled']) &&
    isEnumValue(value['clickPreset'], VideoProjectActionPreset) &&
    isPresentationDuration(value['duration']) &&
    isPresentationOffset(value['offset']) &&
    isBoundedNumber(value['clickSuppressionInterval'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoolean(value['showKeystrokes'])
  );
}

export function isVideoProjectActionPresentationOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['clickStyle'] === undefined || isActionClickStyle(value['clickStyle'])) &&
    (value['keyStyle'] === undefined || isActionKeyStyle(value['keyStyle'])) &&
    (value['easing'] === undefined || isEnumValue(value['easing'], VideoTemporalEasing)) &&
    (value['enabled'] === undefined || isBoolean(value['enabled'])) &&
    (value['preset'] === undefined || isEnumValue(value['preset'], VideoProjectActionPreset)) &&
    (value['duration'] === undefined || isPresentationDuration(value['duration'])) &&
    (value['offset'] === undefined || isPresentationOffset(value['offset'])) &&
    (value['point'] === undefined || isPoint(value['point']))
  );
}

export function isMotionRegion(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value['sourceBinding'] === undefined ||
      parseMotionSourceBinding(value['sourceBinding']) !== null) &&
    isString(value['id']) &&
    (value['animation'] === undefined ||
      (isMotionAnimation(value['animation']) &&
        value['animation'].duration <= MAX_VIDEO_PROJECT_DURATION_SECONDS)) &&
    isBoundedNumber(value['startTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isEnumValue(value['easing'], VideoTemporalEasing) &&
    isEnumValue(value['focusMode'], VideoMotionFocusMode) &&
    isNullable(value['focusPoint'], isPoint) &&
    (value['focusArea'] === undefined || isNullable(value['focusArea'], isRect)) &&
    isBoundedNumber(value['scale'], 0.1, 4) &&
    isNullable(
      value['targetAction'],
      (target) =>
        isRecord(target) && isString(target['eventId']) && isNullable(target['clipId'], isString)
    ) &&
    isBoundedNumber(value['zoomInDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['zoomOutDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    (value['motionBlurAmount'] === undefined || isBoundedNumber(value['motionBlurAmount'], 0, 1)) &&
    value['cameraMode'] !== 'PATH' &&
    (value['path'] === undefined || value['path'] === null) &&
    (value['overlayZoomMode'] === undefined ||
      isEnumValue(value['overlayZoomMode'], VideoMotionOverlayZoomMode))
  );
}
