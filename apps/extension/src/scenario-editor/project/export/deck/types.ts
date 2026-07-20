import type {
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSlideRenderAssetMap } from '../../stage-render/slide';

export type ScenarioDeckExportFormat = 'html' | 'markdown';
export type ScenarioDeckAssetMode = 'embed' | 'files';

export interface ScenarioDeckExportOptions {
  assetMode: ScenarioDeckAssetMode;
  format: ScenarioDeckExportFormat;
  includeMissingPlaceholders: boolean;
  includeNotes: boolean;
  includeSourceJson: boolean;
}

export interface ScenarioDeckExportAsset {
  assetId: string;
  blob: Blob;
  filename: string;
  source: string;
}

export interface ScenarioDeckExportAssets {
  assetsById: ReadonlyMap<string, ScenarioDeckExportAsset>;
  missingAssetIds: string[];
  renderAssets: ScenarioSlideRenderAssetMap;
}

export interface ScenarioDeckExportResult {
  blob: Blob;
  filename: string;
  format: ScenarioDeckExportFormat;
  missingAssetIds: string[];
}

export interface ScenarioDeckExportInput {
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>;
  options: ScenarioDeckExportOptions;
  project: ScenarioProjectV3;
}

export interface ScenarioDeckRenderedSlide {
  index: number;
  slide: ScenarioSlide;
  svg: string;
}
