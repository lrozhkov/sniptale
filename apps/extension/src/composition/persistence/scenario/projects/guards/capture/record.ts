import type { ScenarioAnnotationRenderMode } from '@sniptale/runtime-contracts/scenario/types/base';
import {
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
} from '../../../../../../contracts/messaging/scenario/validators';
import { isString } from '../../../../../../contracts/messaging/validators';
import { parseCaptureMetadataField } from '../../capture-metadata';
import {
  parsePageDescriptor,
  parsePoint,
  parseTargetDescriptor,
  parseImageTransform,
  parseViewportTransform,
  parseNullableString,
} from '../helpers';
import { parseCaptureOverlays } from './overlays';

function parseAnnotationRenderMode(value: unknown): ScenarioAnnotationRenderMode {
  return value === 'asset' ? 'asset' : 'overlays';
}

export function parseCaptureMetadata(record: Record<string, unknown>) {
  return {
    assetId: isString(record['assetId']) ? record['assetId'] : null,
    galleryAssetId: parseNullableString(record['galleryAssetId']),
    captureSurface: isScenarioCaptureSurface(record['captureSurface'])
      ? record['captureSurface']
      : 'visible',
    sourceKind: isScenarioCaptureSourceKind(record['sourceKind']) ? record['sourceKind'] : 'manual',
    page: parsePageDescriptor(record['page']),
    target: parseTargetDescriptor(record['target']),
    interactionPoint: parsePoint(record['interactionPoint']),
    cursorPoint: parsePoint(record['cursorPoint']),
    captureMetadata: parseCaptureMetadataField(record['captureMetadata']),
    overlays: parseCaptureOverlays(record['overlays']),
    annotationRenderMode: parseAnnotationRenderMode(record['annotationRenderMode']),
    imageTransform: parseImageTransform(record['imageTransform']),
    viewportTransform: parseViewportTransform(record['viewportTransform']),
  };
}
