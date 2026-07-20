import type {
  ScenarioRect,
  ScenarioViewportTransform,
} from '@sniptale/runtime-contracts/scenario/types/geometry';

export type ScenarioStageRenderMode = 'editor' | 'export' | 'original';

export interface ScenarioAssetDimensions {
  width: number;
  height: number;
}

export interface ScenarioStageSize {
  width: number;
  height: number;
}

export interface ScenarioStageLayout {
  canvas: ScenarioStageSize;
  viewport: ScenarioViewportTransform;
  imageRect: ScenarioRect;
  sourceViewport: {
    width: number;
    height: number;
  };
}
