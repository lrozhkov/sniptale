import type { Canvas, FabricObject } from 'fabric';
import type { BrowserFrameState, EditorDocument } from '../../../../features/editor/document/types';
import type { PreparedAppliedDocument } from '..';

export type AppliedDocumentCanvasLoadCallbacks = {
  prepareObject: (object: FabricObject) => void;
  syncBackgroundLayer?: (
    frame: EditorDocument['frame'],
    canvasSize: { width: number; height: number }
  ) => Promise<void>;
  rebuildFrameDecorations: (browserFrame: BrowserFrameState) => Promise<void>;
};

export type LoadPreparedDocumentOptions = {
  canvas: Canvas;
  prepared: PreparedAppliedDocument;
  zoomLevel: number;
  preserveViewport?: boolean;
  viewportDevicePixelRatioBaseline?: number;
};
