import { parseMediaSourceCrop } from '../media-crop';
import { parseCameraHiddenRanges } from '../camera/visibility';
import { parseColor } from '@sniptale/foundation/color';
import { parseWindowHeader } from '@sniptale/runtime-contracts/window-header';
import { isCameraAppearance, isCameraCrop } from '../camera/appearance';
import type { VideoProjectClip } from '../types/index';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  VideoProjectClipType,
  isVideoProjectDurationMode,
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
import { parseVideoProjectVoiceTextSnapshot } from '../text/voice-take';

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
    (value['effectsBypassed'] === undefined || isBoolean(value['effectsBypassed'])) &&
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

function hasCameraPositions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 512) return false;
  const ids = new Set<string>();
  let previous = -1;
  return value.every((item: unknown) => {
    if (
      !isRecord(item) ||
      !isBoundedString(item['id'], 256) ||
      !isString(item['id']) ||
      ids.has(item['id']) ||
      !isBoundedNumber(item['sourceTime'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) ||
      typeof item['sourceTime'] !== 'number' ||
      item['sourceTime'] <= previous ||
      (item['crop'] !== undefined && !isCameraCrop(item['crop'])) ||
      !isTransform(item['transform']) ||
      !isRecord(item['transform']) ||
      Number(item['transform']['width']) <= 0 ||
      Number(item['transform']['height']) <= 0 ||
      !isEnumValue(item['fitMode'], VideoMediaFitMode) ||
      !isRecord(item['transition']) ||
      !(
        item['transition']['kind'] === 'instant' ||
        item['transition']['kind'] === 'smooth' ||
        item['transition']['kind'] === 'shrink'
      ) ||
      !isBoundedNumber(item['transition']['duration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS)
    )
      return false;
    ids.add(item['id']);
    previous = item['sourceTime'];
    return true;
  });
}

function isRememberedWindowLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedNumber(value['padding'], 0, 4096) &&
    isBoundedNumber(value['windowCornerRadius'], 0, 4096) &&
    (value['shadowIntensity'] === undefined || isBoundedNumber(value['shadowIntensity'], 0, 100)) &&
    (value['shadowColor'] === undefined ||
      (isColorString(value['shadowColor']) && parseColor(value['shadowColor']) !== null)) &&
    (value['shadowMode'] === undefined || isEnumValue(value['shadowMode'], VideoMediaShadowMode))
  );
}

function hasMediaVisualFields(value: Record<string, unknown>): boolean {
  return (
    (value['rememberedWindowLayout'] === undefined ||
      isRememberedWindowLayout(value['rememberedWindowLayout'])) &&
    (value['windowHeader'] === undefined || parseWindowHeader(value['windowHeader']) !== null) &&
    (value['rememberedWindowHeader'] === undefined ||
      parseWindowHeader(value['rememberedWindowHeader']) !== null) &&
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

function hasOriginalAudioMute(value: Record<string, unknown>): boolean {
  const mute = value['originalAudioMute'];
  if (mute === undefined) return true;
  if (
    value['type'] !== VideoProjectClipType.AUDIO ||
    !isRecord(mute) ||
    Object.keys(mute).some((key) => !['volume', 'targets'].includes(key)) ||
    !isUnitInterval(mute['volume']) ||
    !Array.isArray(mute['targets']) ||
    !mute['targets'].length ||
    mute['targets'].length > 512
  )
    return false;
  const identities = new Set<string>();
  return mute['targets'].every((target: unknown) => {
    if (
      !isRecord(target) ||
      Object.keys(target).some((key) => !['assetId', 'sourceInstanceId'].includes(key))
    )
      return false;
    const assetId = target['assetId'],
      sourceInstanceId = target['sourceInstanceId'];
    if (
      typeof assetId !== 'string' ||
      !assetId ||
      assetId.trim() !== assetId ||
      assetId.length > 256 ||
      typeof sourceInstanceId !== 'string' ||
      !sourceInstanceId ||
      sourceInstanceId.trim() !== sourceInstanceId ||
      sourceInstanceId.length > 256 ||
      (assetId === value['assetId'] &&
        sourceInstanceId === (value['sourceInstanceId'] ?? value['id']))
    )
      return false;
    const key = JSON.stringify([assetId, sourceInstanceId]);
    if (identities.has(key)) return false;
    identities.add(key);
    return true;
  });
}

export function isVideoProjectClip(value: unknown): value is VideoProjectClip {
  if (!isRecord(value) || !hasBaseClipFields(value) || !hasOriginalAudioMute(value)) {
    return false;
  }

  const timing = value['cameraTiming'];
  if (
    timing !== undefined &&
    (value['type'] !== VideoProjectClipType.VIDEO ||
      !isRecord(timing) ||
      Object.keys(timing).some((key) => key !== 'offsetSeconds' && key !== 'transitions') ||
      !isBoundedNumber(timing['offsetSeconds'], -86400, 86400) ||
      timing['transitions'] !== 'bounded')
  )
    return false;

  if (
    isRecord(value['cameraAppearance']) &&
    value['cameraAppearance']['shape'] === 'circle' &&
    value['type'] !== VideoProjectClipType.VIDEO
  )
    return false;

  if (
    value['windowCornerRadius'] !== undefined &&
    ((value['type'] !== VideoProjectClipType.VIDEO &&
      value['type'] !== VideoProjectClipType.IMAGE) ||
      !isBoundedNumber(value['windowCornerRadius'], 0, 4096))
  )
    return false;

  for (const field of ['sourceCrop', 'rememberedSourceCrop']) {
    if (
      value[field] !== undefined &&
      ((value['type'] !== VideoProjectClipType.VIDEO &&
        value['type'] !== VideoProjectClipType.IMAGE) ||
        parseMediaSourceCrop(value[field]) === null)
    )
      return false;
  }

  if (
    value['shadowColor'] !== undefined &&
    ((value['type'] !== VideoProjectClipType.VIDEO &&
      value['type'] !== VideoProjectClipType.IMAGE) ||
      !isColorString(value['shadowColor']) ||
      parseColor(value['shadowColor']) === null)
  )
    return false;

  if (
    value['cameraMirrored'] !== undefined &&
    (value['type'] !== VideoProjectClipType.VIDEO || typeof value['cameraMirrored'] !== 'boolean')
  )
    return false;

  if (
    value['cameraHiddenRanges'] !== undefined &&
    (value['type'] !== VideoProjectClipType.VIDEO ||
      parseCameraHiddenRanges(value['cameraHiddenRanges']) === null)
  )
    return false;

  if (
    value['type'] !== VideoProjectClipType.VIDEO &&
    Array.isArray(value['cameraPositions']) &&
    value['cameraPositions'].some(
      (position: unknown) => isRecord(position) && position['crop'] !== undefined
    )
  )
    return false;

  if (
    value['durationMode'] !== undefined &&
    (value['type'] !== VideoProjectClipType.AUDIO ||
      !isVideoProjectDurationMode(value['durationMode']))
  )
    return false;

  if (
    value['textSnapshot'] !== undefined &&
    (value['type'] !== VideoProjectClipType.AUDIO ||
      !parseVideoProjectVoiceTextSnapshot(value['textSnapshot']))
  )
    return false;

  if (
    value['type'] === VideoProjectClipType.VIDEO ||
    value['type'] === VideoProjectClipType.AUDIO
  ) {
    return (
      isString(value['assetId']) &&
      isBoundedNumber(value['sourceStart'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
      isBoundedNumber(value['sourceDuration'], 0, MAX_VIDEO_PROJECT_DURATION_SECONDS) &&
      (value['playbackRate'] === undefined || isPlaybackRate(value['playbackRate'])) &&
      (value['sourceInstanceId'] === undefined || isString(value['sourceInstanceId'])) &&
      (value['type'] === VideoProjectClipType.AUDIO ||
        (hasMediaVisualFields(value) &&
          hasCameraPositions(value['cameraPositions']) &&
          (value['cameraAppearance'] === undefined ||
            isCameraAppearance(value['cameraAppearance']))))
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
