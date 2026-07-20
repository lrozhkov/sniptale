import type { Rect } from 'fabric';
import type { EditorDocument, EditorTool } from '../../../../features/editor/document/types';
import type { CropSelection, DrawSession, PanSession } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';
import type {
  EditorControllerInstance,
  EditorControllerPublicApiAdapter,
} from '../../instance/types';

import { createEditorControllerBrowserFrameTokenMutators } from './tokens';

export function createEditorControllerPublicApiMutators(controller: EditorControllerInstance) {
  return {
    setCanvasDocumentSize: (size: EditorControllerPublicApiAdapter['canvasDocumentSize']) => {
      controller.canvasDocumentSize = size;
    },
    setSource: (source: SourceState | null) => {
      controller.source = source;
    },
    setOriginalDocument: (document: EditorDocument | null) => {
      controller.originalDocument = document;
    },
    setHistory: (history: EditorControllerPublicApiAdapter['history']) => {
      controller.history = history;
    },
    setActiveTool: (tool: EditorTool) => {
      controller.activeTool = tool;
      controller.toolModeEnabled = true;
    },
    setZoomLevel: (zoomLevel: number) => {
      controller.zoomLevel = zoomLevel;
    },
    setDrawSession: (session: DrawSession | null) => {
      controller.drawSession = session;
    },
    setCropState: (cropGuide: Rect | null, cropSelection: CropSelection | null) => {
      controller.cropGuide = cropGuide;
      controller.cropSelection = cropSelection;
    },
    setPanSession: (session: PanSession | null) => {
      controller.panSession = session;
    },
    setLayerMutationToken: (token: number) => {
      controller.layerMutationToken = token;
    },
    setLastLayerSelectionAnchorId: (id: string | null) => {
      controller.lastLayerSelectionAnchorId = id;
    },
    ...createEditorControllerBrowserFrameTokenMutators(controller),
    createLayerMutationToken: () => {
      controller.layerMutationToken += 1;
      return controller.layerMutationToken;
    },
    isLayerMutationTokenCurrent: (token: number) => controller.layerMutationToken === token,
    withHistoryMuted: <T>(callback: () => T) => controller.withHistoryMuted(callback),
  };
}
