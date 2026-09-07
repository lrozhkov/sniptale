import {
  isBoolean,
  isBoundedArray,
  isBoundedNumber,
  isEnumValue,
  isFiniteNumber,
  isProjectDimension,
  isNullable,
  isRecord,
  isString,
  isUnitInterval,
  MAX_VIDEO_PROJECT_DURATION_SECONDS,
  MAX_VIDEO_PROJECT_MEDIA_BYTES,
} from './primitives';
import { VideoProjectAssetType } from '../types/index';

function isAssetSource(value: unknown): boolean {
  if (!isRecord(value) || !isString(value['kind'])) {
    return false;
  }

  if (value['kind'] === 'recording') {
    return isString(value['recordingId']);
  }
  if (value['kind'] === 'project-asset') {
    return (
      isString(value['projectAssetId']) &&
      (value['originRecordingId'] === undefined || isString(value['originRecordingId'])) &&
      (value['originMediaId'] === undefined || isString(value['originMediaId']))
    );
  }
  if (value['kind'] === 'scenario-asset') {
    return isString(value['scenarioAssetId']);
  }
  return false;
}

function isAssetMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    isProjectDimension(value['width']) &&
    isProjectDimension(value['height']) &&
    isNullable(value['duration'], (duration) =>
      isBoundedNumber(duration, 0, MAX_VIDEO_PROJECT_DURATION_SECONDS)
    ) &&
    isString(value['mimeType']) &&
    isBoundedNumber(value['size'], 0, MAX_VIDEO_PROJECT_MEDIA_BYTES) &&
    isBoolean(value['hasAudio']) &&
    (value['audioPeaks'] === null || isBoundedArray(value['audioPeaks'], isUnitInterval))
  );
}

function isRecordingPart(value: unknown, assetType: unknown): boolean {
  if (!isRecord(value) || !isString(value['recordingId']) || value['recordingId'].length === 0) {
    return false;
  }
  return assetType === VideoProjectAssetType.AUDIO
    ? value['role'] === 'audio'
    : assetType === VideoProjectAssetType.RECORDING &&
        (value['role'] === 'primary' || value['role'] === 'camera' || value['role'] === 'video');
}

export function isVideoProjectAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isEnumValue(value['type'], VideoProjectAssetType) &&
    isString(value['name']) &&
    isAssetSource(value['source']) &&
    isAssetMetadata(value['metadata']) &&
    (value['recordingPart'] === undefined ||
      isRecordingPart(value['recordingPart'], value['type'])) &&
    isFiniteNumber(value['createdAt'])
  );
}
