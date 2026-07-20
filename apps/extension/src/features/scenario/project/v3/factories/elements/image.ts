import type {
  ScenarioAssetRef,
  ScenarioImageElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioElementBase } from './base';

const EMPTY_ASSET_REF: ScenarioAssetRef = {
  assetId: '',
  galleryAssetId: null,
};

export function createScenarioImageElement(
  overrides: Partial<ScenarioImageElement> = {}
): ScenarioImageElement {
  return {
    ...createScenarioElementBase({
      animation: overrides.animation,
      build: overrides.build,
      frame: overrides.frame ?? { height: 420, width: 720, x: 120, y: 160 },
      kind: 'image',
      name: overrides.name ?? 'Image',
      role: overrides.role,
      stylePresetId: overrides.stylePresetId,
    }),
    assetRef: overrides.assetRef ?? EMPTY_ASSET_REF,
    captureContext: overrides.captureContext ?? null,
    contentTransform: overrides.contentTransform ?? {
      scale: 1,
      x: 0,
      y: 0,
    },
    editDocumentId: overrides.editDocumentId ?? null,
    fit: overrides.fit ?? 'contain',
  };
}
