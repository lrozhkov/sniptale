import type { ScenarioOverlay } from '../contracts/types/overlays';
import { buildScenarioEditorCanvasDocument } from './editor-canvas-document';

export function buildScenarioEditorCanvasJson(args: {
  assetDataUrl: string;
  overlays: ScenarioOverlay[];
  sourceHeight: number;
  sourceWidth: number;
}): string {
  return JSON.stringify(buildScenarioEditorCanvasDocument(args));
}
