import type { Canvas, FabricObject, Rect } from 'fabric';
import type {
  BrowserFrameState,
  EditorDocument,
  EditorFrameSettings,
  EditorObjectType,
  EditorTool,
} from '../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import type { ApplyDocumentOptions, CropSelection, DrawSession, PanSession } from '../core/types';
import type { SourceState } from '../../document/model/source-state';
import type {
  EditorControllerDocumentSize,
  EditorControllerRelayoutOptions,
} from '../instance/types/shared';
import type {
  EditorRenderedImageOptions,
  EditorRenderToDataUrlOptions,
} from '../../document/model/render-options';

export type EditorControllerPublicApiAdapter = {
  canvas: Canvas | null;
  source: SourceState | null;
  originalDocument: EditorDocument | null;
  history: SnapshotHistory<string> | null;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline: number;
  canvasDocumentSize: EditorControllerDocumentSize;
  drawSession: DrawSession | null;
  cropGuide: Rect | null;
  cropSelection: CropSelection | null;
  panSession: PanSession | null;
  activeTool: EditorTool;
  layerMutationToken: number;
  lastLayerSelectionAnchorId: string | null;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: EditorObjectType) => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  ensureObjectReachable: (object: FabricObject) => boolean;
  focusObjectInViewport: (object: FabricObject) => void;
  ensureReachableObjects: () => boolean;
  rebuildFrameDecorations: () => Promise<void>;
  sendFrameObjectsToBack: () => void;
  ensureBrowserFrameOnTop: () => void;
  logBrowserFrame: (stage: string, payload?: Record<string, unknown>) => void;
  relayoutScene: (
    frame: EditorFrameSettings,
    browserFrame: BrowserFrameState,
    options?: EditorControllerRelayoutOptions
  ) => void;
  scheduleZoomToFit: () => void;
  applyDocument: (document: EditorDocument, options: ApplyDocumentOptions) => Promise<void>;
  renderToDataUrl: (options: EditorRenderToDataUrlOptions) => string;
  copyRenderedImage: (options?: EditorRenderedImageOptions) => Promise<void>;
  switchToSelectTool: () => void;
  clearSelection: () => void;
  clearCropSelection: () => void;
  setCanvasDocumentSize: (size: EditorControllerDocumentSize) => void;
  setSource: (source: SourceState | null) => void;
  setOriginalDocument: (document: EditorDocument | null) => void;
  setHistory: (history: SnapshotHistory<string> | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setZoomLevel: (zoomLevel: number) => void;
  setDrawSession: (session: DrawSession | null) => void;
  setCropState: (cropGuide: Rect | null, cropSelection: CropSelection | null) => void;
  setPanSession: (session: PanSession | null) => void;
  setLayerMutationToken: (token: number) => void;
  setLastLayerSelectionAnchorId: (id: string | null) => void;
  createBrowserFrameRenderToken: () => number;
  isBrowserFrameRenderTokenCurrent: (token: number) => boolean;
  createLayerMutationToken: () => number;
  isLayerMutationTokenCurrent: (token: number) => boolean;
  withHistoryMuted: <T>(callback: () => T) => T;
};
