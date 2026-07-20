import type { VideoProjectClip } from '../types/index';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoProjectShapeType,
} from '../types/index';
import {
  isBoolean,
  isBoundedNumber,
  isBoundedString,
  isColorString,
  isCoordinate,
  isEnumValue,
  isNullable,
  isPlaybackRate,
  isPositiveStyleSize,
  isProjectDimension,
  isRecord,
  isRect,
  isString,
  isStyleSize,
  isUnitInterval,
  isVolume,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
} from './primitives';
import { hasAnnotationFields } from './annotations';

function isTransform(value: unknown): boolean {
  return (
    isRecord(value) &&
    isCoordinate(value['x']) &&
    isCoordinate(value['y']) &&
    isProjectDimension(value['width']) &&
    isProjectDimension(value['height']) &&
    isBoundedNumber(value['rotation'], -3600, 3600) &&
    isUnitInterval(value['opacity'])
  );
}

function hasBaseClipFields(value: Record<string, unknown>): boolean {
  return (
    isString(value['id']) &&
    isString(value['trackId']) &&
    isEnumValue(value['type'], VideoProjectClipType) &&
    isString(value['name']) &&
    isNullable(value['groupId'], isString) &&
    isEnumValue(value['linkMode'], VideoClipLinkMode) &&
    isBoundedNumber(value['startTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoundedNumber(value['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
    isBoolean(value['muted']) &&
    isVolume(value['volume']) &&
    (value['audioGainStart'] === undefined || isVolume(value['audioGainStart'])) &&
    (value['audioGainEnd'] === undefined || isVolume(value['audioGainEnd'])) &&
    (value['volumeEnvelopeStart'] === undefined || isVolume(value['volumeEnvelopeStart'])) &&
    (value['volumeEnvelopeEnd'] === undefined || isVolume(value['volumeEnvelopeEnd'])) &&
    isBoundedNumber(value['fadeInMs'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS * 1000) &&
    isBoundedNumber(value['fadeOutMs'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS * 1000) &&
    isEnumValue(value['transitionIn'], VideoClipTransitionKind) &&
    isEnumValue(value['transitionOut'], VideoClipTransitionKind) &&
    isTransform(value['transform'])
  );
}

function hasMediaVisualFields(value: Record<string, unknown>): boolean {
  return (
    isEnumValue(value['fitMode'], VideoMediaFitMode) &&
    (value['fitScalePercent'] === undefined ||
      isBoundedNumber(value['fitScalePercent'], 1, 1000)) &&
    (value['shadowIntensity'] === undefined || isBoundedNumber(value['shadowIntensity'], 0, 100))
  );
}

function isTextStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isPositiveStyleSize(value['fontSize']) &&
    isBoundedString(value['fontFamily'], 256) &&
    isBoundedNumber(value['fontWeight'], 1, 1000) &&
    isColorString(value['color']) &&
    isColorString(value['backgroundColor']) &&
    isColorString(value['borderColor']) &&
    isStyleSize(value['borderWidth']) &&
    isStyleSize(value['padding']) &&
    isStyleSize(value['borderRadius']) &&
    isBoundedNumber(value['lineHeight'], 0.1, 8) &&
    (value['textAlign'] === 'left' ||
      value['textAlign'] === 'center' ||
      value['textAlign'] === 'right')
  );
}

function isShapeStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isColorString(value['fillColor']) &&
    isColorString(value['strokeColor']) &&
    isStyleSize(value['strokeWidth']) &&
    isStyleSize(value['borderRadius'])
  );
}

function isEmbeddedShapeAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['assetId']) &&
    (value['opacity'] === undefined || isUnitInterval(value['opacity'])) &&
    isRect(value['placement'])
  );
}

export function isVideoProjectClip(value: unknown): value is VideoProjectClip {
  if (!isRecord(value) || !hasBaseClipFields(value)) {
    return false;
  }

  if (
    value['type'] === VideoProjectClipType.VIDEO ||
    value['type'] === VideoProjectClipType.AUDIO
  ) {
    return (
      isString(value['assetId']) &&
      isBoundedNumber(value['sourceStart'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
      isBoundedNumber(value['sourceDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
      (value['playbackRate'] === undefined || isPlaybackRate(value['playbackRate'])) &&
      (value['type'] === VideoProjectClipType.AUDIO || hasMediaVisualFields(value))
    );
  }
  if (value['type'] === VideoProjectClipType.IMAGE) {
    return isString(value['assetId']) && hasMediaVisualFields(value);
  }
  if (value['type'] === VideoProjectClipType.TEXT) {
    return isString(value['text']) && isTextStyle(value['style']);
  }
  if (value['type'] === VideoProjectClipType.SUBTITLE) {
    return isString(value['text']);
  }
  if (value['type'] === VideoProjectClipType.SHAPE) {
    return (
      isEnumValue(value['shapeType'], VideoProjectShapeType) &&
      isShapeStyle(value['style']) &&
      (value['embeddedAsset'] === undefined || isEmbeddedShapeAsset(value['embeddedAsset']))
    );
  }
  if (value['type'] === VideoProjectClipType.EFFECT) {
    return isString(value['effectInstanceId']);
  }
  return value['type'] === VideoProjectClipType.ANNOTATION && hasAnnotationFields(value);
}
