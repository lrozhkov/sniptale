import { isCaptureContext } from './element-guards.capture.ts';
import { isScenarioColorToken } from './color-token';
import { SCENARIO_V3_LIMITS } from './limits';
import { isBoundedString, isFiniteNumber, isNullableBoundedString, isRecord } from './value-guards';

export function isSlideSource(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (value['kind'] === 'manual') {
    return true;
  }

  return (
    value['kind'] === 'capture' &&
    isBoundedString(value['assetId'], SCENARIO_V3_LIMITS.maxAssetIdLength) &&
    value['assetId'].length > 0 &&
    isNullableBoundedString(value['galleryAssetId'], SCENARIO_V3_LIMITS.maxAssetIdLength) &&
    isNullableBoundedString(value['captureSurface'], SCENARIO_V3_LIMITS.maxNameLength) &&
    isNullableBoundedString(value['sourceKind'], SCENARIO_V3_LIMITS.maxNameLength) &&
    isCaptureContext(value)
  );
}

export function isCanvas(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value['width']) &&
    value['width'] > 0 &&
    value['width'] <= SCENARIO_V3_LIMITS.maxCanvasDimension &&
    isFiniteNumber(value['height']) &&
    value['height'] > 0 &&
    value['height'] <= SCENARIO_V3_LIMITS.maxCanvasDimension &&
    isCanvasBackground(value['background'])
  );
}

function isCanvasBackground(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (value['kind'] === 'transparent') {
    return Object.keys(value).length === 1;
  }

  return value['kind'] === 'solid' && isScenarioColorToken(value['color']);
}
