import { isMotionFocusArea } from '../motion/focus-area';
import { parseQuickEditBorder, parseQuickEditSpotlight } from '../scene/focus-appearance';
import {
  parseCameraPerspective,
  parseCameraDepth,
  parseMotionSpatialReference,
} from '../motion/spatial';
import { parseMotionPhaseTransitions } from '../motion/transitions';
import { parseMotionBlurPhases } from '../motion/blur';
import { parseCameraFollowSettings } from '../camera/cursor-policy';
import { isRecordingInteractionMetadata } from './recording-telemetry';
import {
  isRecordingKeyboardRhythmBlocks,
  areRecordingKeyboardRhythmBlocksWithin,
} from '../keyboard-rhythm';
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
  isScale,
  isString,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
  MAX_VIDEO_PROJECT_ITEMS,
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

function isCursorSourceIdentity(value: unknown): value is string {
  return (
    isString(value) && value.length > 0 && isBoundedString(value, 256) && value.trim() === value
  );
}

function isCursorSourceObservations(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_VIDEO_PROJECT_ITEMS) return false;
  const groups = new Set<string>();
  return value.every((group) => {
    if (
      !isRecord(group) ||
      Object.keys(group).some(
        (key) => !['recordingId', 'sourceInstanceId', 'samples'].includes(key)
      ) ||
      !isCursorSourceIdentity(group['recordingId']) ||
      !isCursorSourceIdentity(group['sourceInstanceId']) ||
      !Array.isArray(group['samples'])
    )
      return false;
    const identity = JSON.stringify([group['recordingId'], group['sourceInstanceId']]);
    if (groups.has(identity)) return false;
    groups.add(identity);
    const ids = new Set<string>();
    let previous = -1;
    return group['samples'].every((sample: unknown) => {
      if (
        !isRecord(sample) ||
        Object.keys(sample).some(
          (key) =>
            ![
              'id',
              'time',
              'x',
              'y',
              'visible',
              'recordingPoint',
              'observationClockId',
              'captureSegment',
              'observation',
              'interpolation',
              'interpolationRange',
              'skinOverride',
            ].includes(key)
        ) ||
        !isCursorSample(sample) ||
        !isCursorSourceIdentity(sample['id']) ||
        ids.has(sample['id']) ||
        !isBoundedNumber(sample['time'], previous, MAX_VIDEO_PROJECT_DURATION_SECONDS) ||
        (sample['recordingPoint'] !== undefined &&
          sample['recordingPoint'] !== null &&
          (!isRecord(sample['recordingPoint']) ||
            Object.keys(sample['recordingPoint']).some((key) => key !== 'x' && key !== 'y') ||
            !isBoundedNumber(sample['recordingPoint']['x'], 0, 1) ||
            !isBoundedNumber(sample['recordingPoint']['y'], 0, 1))) ||
        (sample['captureSegment'] !== undefined &&
          (!isBoundedNumber(sample['captureSegment'], 0, Number.MAX_SAFE_INTEGER) ||
            !Number.isInteger(sample['captureSegment']))) ||
        (sample['observationClockId'] !== undefined &&
          !isCursorSourceIdentity(sample['observationClockId'])) ||
        (sample['observation'] !== undefined &&
          (!isString(sample['observation']) ||
            !['observed', 'outside', 'hidden', 'blur', 'paused'].includes(sample['observation'])))
      )
        return false;
      ids.add(sample['id']);
      previous = sample['time'];
      return true;
    });
  });
}

export function isCursorTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['captureMode'], VideoCursorCaptureMode) &&
    (value['sourceObservations'] === undefined ||
      isCursorSourceObservations(value['sourceObservations'])) &&
    (Array.isArray(value['sourceObservations']) && value['sourceObservations'].length > 0
      ? Array.isArray(value['samples']) && value['samples'].every(isCursorSample)
      : isBoundedArray(value['samples'], isCursorSample)) &&
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
    (value['keyboardRepeats'] === undefined ||
      isRecordingKeyboardRhythmBlocks(value['keyboardRepeats'])) &&
    isEnumValue(value['kind'], VideoProjectActionEventKind) &&
    isBoundedString(value['label']) &&
    isPrimitiveRecord(value['data']) &&
    isRecordingInteractionMetadata(value['data']) &&
    (value['keyboardRepeats'] === undefined ||
      (isRecord(value['data']) &&
        areRecordingKeyboardRhythmBlocksWithin(
          value['keyboardRepeats'],
          typeof value['data']['downTime'] === 'number' ? value['data']['downTime'] : 0,
          typeof value['data']['upTime'] === 'number'
            ? value['data']['upTime']
            : typeof value['data']['lastObservedTime'] === 'number'
              ? value['data']['lastObservedTime']
              : 86400
        ))) &&
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
  if (!isRecord(value)) return false;
  const phaseTransitions = parseMotionPhaseTransitions(value['phaseTransitions']);
  return (
    phaseTransitions !== null &&
    (!isRecord(value['sourceBinding']) ||
      value['sourceBinding']['dormant'] !== true ||
      value['duration'] === 0) &&
    (value['border'] === undefined
      ? value['borderTarget'] === undefined
      : parseQuickEditBorder(value['border']) !== null &&
        (value['borderTarget'] === 'viewport' ||
          (value['borderTarget'] === 'window' && value['sourceBinding'] !== undefined))) &&
    (value['spotlight'] === undefined
      ? value['spotlightTarget'] === undefined
      : value['border'] === undefined &&
        parseQuickEditSpotlight(value['spotlight']) !== null &&
        (value['spotlightTarget'] === 'viewport' ||
          ((value['spotlightTarget'] === 'window' ||
            value['spotlightTarget'] === 'scene' ||
            value['spotlightTarget'] === 'source-scene') &&
            value['sourceBinding'] !== undefined))) &&
    parseCameraPerspective(value['perspective']) !== null &&
    parseCameraDepth(value['depthOfField']) !== null &&
    parseMotionSpatialReference(value['spatialReference']) !== null &&
    (value['cameraFollow'] === undefined ||
      parseCameraFollowSettings(value['cameraFollow']) !== null) &&
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
    (value['focusArea'] === undefined || isNullable(value['focusArea'], isMotionFocusArea)) &&
    isBoundedNumber(value['scale'], 0.1, 4) &&
    isNullable(
      value['targetAction'],
      (target) =>
        isRecord(target) && isString(target['eventId']) && isNullable(target['clipId'], isString)
    ) &&
    isBoundedNumber(
      value['zoomInDuration'],
      0,
      phaseTransitions?.enter === undefined ? MAX_VIDEO_PROJECT_DURATION_SECONDS : 60
    ) &&
    isBoundedNumber(
      value['zoomOutDuration'],
      0,
      phaseTransitions?.exit === undefined ? MAX_VIDEO_PROJECT_DURATION_SECONDS : 60
    ) &&
    (value['motionBlurAmount'] === undefined || isBoundedNumber(value['motionBlurAmount'], 0, 1)) &&
    parseMotionBlurPhases(value['motionBlur']) !== null &&
    value['cameraMode'] !== 'PATH' &&
    (value['path'] === undefined || value['path'] === null) &&
    (value['overlayZoomMode'] === undefined ||
      isEnumValue(value['overlayZoomMode'], VideoMotionOverlayZoomMode))
  );
}
