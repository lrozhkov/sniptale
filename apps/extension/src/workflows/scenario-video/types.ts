import type { ScenarioProject } from '../../features/scenario/contracts/types/project';

export interface ScenarioVideoBridgeAsset {
  createdAt: number;
  height: number;
  mimeType: string;
  name: string;
  size: number;
  width: number;
}

export interface BuildScenarioVideoProjectDraftArgs {
  assets: Record<string, ScenarioVideoBridgeAsset>;
  fps?: number;
  height?: number;
  project: ScenarioProject;
  stepDuration?: number;
  width?: number;
}
