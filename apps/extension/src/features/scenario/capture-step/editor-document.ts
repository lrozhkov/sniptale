import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../editor/document/public';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import { buildScenarioEditorCanvasJson } from './editor-canvas';

export function createScenarioCaptureEditorDocument(args: {
  dataUrl: string;
  overlays: ScenarioOverlay[];
  sourceName?: string | null;
  sourceHeight: number;
  sourceWidth: number;
}): EditorDocument {
  return {
    version: 2,
    sourceImageData: args.dataUrl,
    sourceName: args.sourceName ?? null,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
    canvasWidth: args.sourceWidth,
    canvasHeight: args.sourceHeight,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: args.sourceWidth,
    sourceDisplayHeight: args.sourceHeight,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: buildScenarioEditorCanvasJson({
      assetDataUrl: args.dataUrl,
      overlays: args.overlays,
      sourceHeight: args.sourceHeight,
      sourceWidth: args.sourceWidth,
    }),
  };
}

export { buildAutoScenarioCaptureOverlays } from './auto-overlays';
