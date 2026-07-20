import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioAnnotationRenderMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type { ScenarioCaptureStep } from '../../../contracts/types/project';
import type { ScenarioOverlay } from '../../../contracts/types/overlays';
import {
  createDefaultScenarioPageDescriptor,
  createDefaultScenarioViewport,
  getDefaultScenarioCaptureMetadata,
  getDefaultScenarioImageTransform,
} from '../../defaults';
import { createBaseStep } from '../helpers';

export function createScenarioCaptureStep(args: {
  assetId: string;
  body?: string;
  annotationRenderMode?: ScenarioAnnotationRenderMode;
  captureSurface?: 'visible' | 'full' | 'selection';
  cursorPoint?: ScenarioPoint | null;
  galleryAssetId?: string | null;
  interactionPoint?: ScenarioPoint | null;
  overlays?: ScenarioOverlay[];
  page?: ScenarioPageDescriptor;
  captureMetadata?: ScenarioCaptureMetadata;
  sourceKind?: 'manual' | 'auto-click';
  target?: ScenarioTargetDescriptor | null;
  title?: string;
}): ScenarioCaptureStep {
  return {
    ...createBaseStep({
      kind: 'capture',
      ...(args.title === undefined ? {} : { title: args.title }),
      ...(args.body === undefined ? {} : { body: args.body }),
    }),
    assetId: args.assetId,
    galleryAssetId: args.galleryAssetId ?? null,
    captureSurface: args.captureSurface ?? 'visible',
    sourceKind: args.sourceKind ?? 'manual',
    page: args.page ?? createDefaultScenarioPageDescriptor(),
    target: args.target ?? null,
    interactionPoint: args.interactionPoint ?? null,
    cursorPoint: args.cursorPoint ?? null,
    captureMetadata: args.captureMetadata ?? getDefaultScenarioCaptureMetadata(),
    overlays: args.overlays ?? [],
    annotationRenderMode: args.annotationRenderMode ?? 'overlays',
    imageTransform: getDefaultScenarioImageTransform(),
    viewportTransform: createDefaultScenarioViewport(),
  };
}
