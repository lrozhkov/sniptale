import type { Canvas, Rect } from 'fabric';
import type { EditorDocument, EditorTool } from '../../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { EditorControllerEventHandlers } from '../../events';
import type { EditorSelectionNudgeSession } from '../../tools/nudge';
import type { EditorSessionAutosaveService } from '../../../document/session-autosave';
import type { EditorMagnetManager } from '../../magnet';
import type { EditorRasterToolSessionState } from '../../raster-tools/types';
import type { CropSelection, DrawSession, PanSession } from '../../core/types';
import type { SourceState } from '../../../document/model/source-state';
import type { EditorControllerDocumentSize } from './shared';

export interface EditorControllerMountedElementsState {
  canvas: Canvas | null;
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
}

export interface EditorControllerDocumentState {
  source: SourceState | null;
  originalDocument: EditorDocument | null;
  history: SnapshotHistory<string> | null;
  historyMuted: number;
  autosaveService: EditorSessionAutosaveService | null;
}

export interface EditorControllerInteractionState {
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
  activeTool: EditorTool;
  toolModeEnabled: boolean;
  cropSelectionMouseEnabled: boolean;
  isSpacePressed: boolean;
  panSession: PanSession | null;
  rasterToolSession: EditorRasterToolSessionState;
  selectionNudgeSession: EditorSelectionNudgeSession | null;
  lastLayerSelectionAnchorId: string | null;
}

export interface EditorControllerViewportStateOwner {
  zoomLevel: number;
  canvasDocumentSize: EditorControllerDocumentSize;
  magnetManager: EditorMagnetManager | null;
  viewportResizeObserver: ResizeObserver | null;
  viewportSyncFrame: number;
  viewportDevicePixelRatioBaseline: number;
}

export interface EditorControllerMutationState {
  browserFrameRenderToken: number;
  layerMutationToken: number;
  eventHandlers: EditorControllerEventHandlers;
}

export interface EditorControllerInstanceState
  extends
    EditorControllerMountedElementsState,
    EditorControllerDocumentState,
    EditorControllerInteractionState,
    EditorControllerViewportStateOwner,
    EditorControllerMutationState {}
