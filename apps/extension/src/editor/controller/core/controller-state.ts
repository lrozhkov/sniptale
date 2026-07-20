import type { Rect } from 'fabric';
import type { EditorDocument, EditorTool } from '../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { SourceState } from '../../document/model/source-state';
import type { CropSelection, DrawSession, PanSession } from './types';
import {
  createEditorControllerEventBindings,
  createEditorControllerPublicApiAdapter,
} from '../instance/bindings';
import { createEditorControllerEventHandlers } from '../events';
import type { EditorControllerInstance } from '../instance/types';
import type { EditorSessionAutosaveService } from '../../document/session-autosave';
import type { EditorMagnetManager } from '../magnet';
import { createEditorRasterToolSession } from '../raster-tools/session/state';
import { getEditorViewportDevicePixelRatioBaseline } from '../viewport';

export abstract class ImageEditorControllerState {
  canvas = null;
  viewportElement = null;
  stageElement = null;
  drawSession: DrawSession | null = null;
  cropGuide: Rect | null = null;
  cropSelection: CropSelection | null = null;
  source: SourceState | null = null;
  originalDocument: EditorDocument | null = null;
  history: SnapshotHistory<string> | null = null;
  historyMuted = 0;
  activeTool: EditorTool = 'select';
  toolModeEnabled = true;
  cropSelectionMouseEnabled = true;
  zoomLevel = 1;
  canvasDocumentSize = { width: 0, height: 0 };
  isSpacePressed = false;
  panSession: PanSession | null = null;
  magnetManager: EditorMagnetManager | null = null;
  viewportResizeObserver: ResizeObserver | null = null;
  viewportSyncFrame = 0;
  viewportDevicePixelRatioBaseline = 1;
  browserFrameRenderToken = 0;
  layerMutationToken = 0;
  rasterToolSession = createEditorRasterToolSession();
  selectionNudgeSession = null;
  lastLayerSelectionAnchorId: string | null = null;
  autosaveService: EditorSessionAutosaveService | null = null;
  readonly eventHandlers = createEditorControllerEventHandlers(
    createEditorControllerEventBindings(this.getControllerInstance())
  );

  protected abstract getControllerInstance(): EditorControllerInstance;

  protected get instance() {
    return this.getControllerInstance();
  }

  getPublicApiAdapter() {
    return createEditorControllerPublicApiAdapter(this.instance);
  }

  protected resetViewportDevicePixelRatioBaseline(): void {
    this.viewportDevicePixelRatioBaseline = getEditorViewportDevicePixelRatioBaseline();
  }
}
