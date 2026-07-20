import {
  isBoundedArray,
  isFiniteNumber,
  isNonNegativeNumber,
  isPositiveNumber,
  isRecord,
  isString,
} from './primitives';

function isObjectTrackSample(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasValidObjectTrackGeometry(value) &&
    typeof value['visible'] === 'boolean' &&
    isFiniteNumber(value['confidence'])
  );
}

function isObjectTrackAnalysis(value: unknown): boolean {
  const mode = value && isRecord(value) ? value['mode'] : undefined;
  return (
    isRecord(value) &&
    (mode === undefined || mode === 'coarseKeyframes' || mode === 'visualFrames') &&
    isString(value['sourceAssetId']) &&
    isString(value['sourceClipId']) &&
    isNonNegativeNumber(value['projectStartTime']) &&
    isNonNegativeNumber(value['projectEndTime']) &&
    isPositiveNumber(value['sampleFps']) &&
    (value['quality'] === undefined ||
      (isRecord(value['quality']) &&
        isNonNegativeNumber(value['quality']['coverageRatio']) &&
        isNonNegativeNumber(value['quality']['jumpCount']) &&
        isFiniteNumber(value['quality']['medianConfidence']) &&
        isString(value['quality']['status']) &&
        isNonNegativeNumber(value['quality']['visibleSamples'])))
  );
}

function isObjectTrackCorrectionAnchor(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    hasValidObjectTrackGeometry(value) &&
    (value['confidence'] === undefined || isFiniteNumber(value['confidence']))
  );
}

function hasValidObjectTrackGeometry(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeNumber(value['time']) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    (value['width'] === undefined || isNonNegativeNumber(value['width'])) &&
    (value['height'] === undefined || isNonNegativeNumber(value['height']))
  );
}

export function isObjectTrack(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    (value['kind'] === 'cursor' ||
      value['kind'] === 'object' ||
      value['kind'] === 'visualCursor') &&
    (value['source'] === 'manual' ||
      value['source'] === 'telemetry' ||
      value['source'] === 'visualDetection') &&
    (value['detectorVersion'] === undefined || isString(value['detectorVersion'])) &&
    (value['hidden'] === undefined || typeof value['hidden'] === 'boolean') &&
    (value['role'] === undefined || value['role'] === 'cameraCursor') &&
    (value['analysis'] === undefined || isObjectTrackAnalysis(value['analysis'])) &&
    (value['correctionAnchors'] === undefined ||
      isBoundedArray(value['correctionAnchors'], isObjectTrackCorrectionAnchor)) &&
    isBoundedArray(value['samples'], isObjectTrackSample)
  );
}

function isUtilityLaneState(value: unknown): boolean {
  return (
    isRecord(value) && typeof value['visible'] === 'boolean' && typeof value['locked'] === 'boolean'
  );
}

export function isUtilityLanes(value: unknown): boolean {
  return (
    isRecord(value) && isUtilityLaneState(value['actions']) && isUtilityLaneState(value['camera'])
  );
}
