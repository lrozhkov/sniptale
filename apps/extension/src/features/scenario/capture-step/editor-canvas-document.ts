import type { ScenarioOverlay } from '../contracts/types/overlays';
import { createBlurRectCanvasObject } from './editor-canvas-blur-rect';
import { createFocusRectCanvasObject } from './editor-canvas-focus-rect';
import { createPointOverlayCanvasObject } from './editor-canvas-point-overlays';
import {
  createScenarioEditorCanvasDocument,
  type ScenarioEditorCanvasObject,
} from './editor-canvas-shared';

function createScenarioEditorCanvasObjects(args: {
  assetDataUrl: string;
  overlays: ScenarioOverlay[];
  sourceHeight: number;
  sourceWidth: number;
}): ScenarioEditorCanvasObject[] {
  return args.overlays.flatMap((overlay) => {
    switch (overlay.kind) {
      case 'focus-rect':
        return [createFocusRectCanvasObject(overlay)];
      case 'click-ring':
        return [createPointOverlayCanvasObject(overlay)];
      case 'cursor':
        return [createPointOverlayCanvasObject(overlay)];
      case 'blur-rect':
        return [
          createBlurRectCanvasObject({
            assetDataUrl: args.assetDataUrl,
            overlay,
            sourceHeight: args.sourceHeight,
            sourceWidth: args.sourceWidth,
          }),
        ];
      case 'arrow':
      case 'rectangle':
      case 'ellipse':
      case 'text':
        return [];
    }
  });
}

export function buildScenarioEditorCanvasDocument(args: {
  assetDataUrl: string;
  overlays: ScenarioOverlay[];
  sourceHeight: number;
  sourceWidth: number;
}) {
  return createScenarioEditorCanvasDocument(createScenarioEditorCanvasObjects(args));
}
