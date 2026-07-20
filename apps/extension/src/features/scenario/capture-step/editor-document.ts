import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  type EditorDocument,
} from '../../editor/document/public';
import type { ScenarioCaptureStep } from '../contracts/types/project';
import type { ScenarioOverlay } from '../contracts/types/overlays';
import { buildScenarioEditorCanvasJson } from './editor-canvas';
import { buildScenarioEditorCanvasDocument } from './editor-canvas-document';
import { parseScenarioEditorCanvasJson } from './editor-canvas-json';
import { projectCompatOverlaysFromEditorDocument } from './editor-document-projection';

export function createScenarioCaptureEditorDocument(args: {
  dataUrl: string;
  overlays: ScenarioOverlay[];
  sourceName?: string | null;
  sourceHeight: number;
  sourceWidth: number;
}): EditorDocument {
  return {
    version: 1,
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

export { projectCompatOverlaysFromEditorDocument };
export { buildAutoScenarioCaptureOverlays } from './auto-overlays';

function isCompatOverlayCanvasObject(object: Record<string, unknown>): boolean {
  return (
    object['sniptaleMetaKind'] === 'scenario-focus-rect' ||
    object['sniptaleMetaKind'] === 'scenario-click-ring' ||
    object['sniptaleMetaKind'] === 'scenario-cursor' ||
    object['sniptaleMetaKind'] === 'scenario-blur-rect' ||
    object['sniptaleType'] === 'blur'
  );
}

export function syncScenarioCaptureEditorDocumentOverlays(
  document: EditorDocument,
  overlays: ScenarioOverlay[]
): EditorDocument {
  const parsed = parseScenarioEditorCanvasJson(document.canvasJson);
  if (!parsed) {
    return document;
  }

  const preservedObjects = parsed.objects.filter((object) => !isCompatOverlayCanvasObject(object));
  const compatObjects = buildScenarioEditorCanvasDocument({
    assetDataUrl: document.sourceImageData,
    overlays,
    sourceHeight: document.sourceDisplayHeight,
    sourceWidth: document.sourceDisplayWidth,
  }).objects.filter(isCompatOverlayCanvasObject);

  return {
    ...document,
    canvasJson: JSON.stringify({
      version: parsed.version ?? '7.2.0',
      objects: [...preservedObjects, ...compatObjects],
    }),
  };
}

export function shouldRenderScenarioStepOverlays(step: ScenarioCaptureStep): boolean {
  return step.annotationRenderMode !== 'asset';
}
