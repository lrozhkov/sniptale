import type { Canvas, FabricObject } from 'fabric';
import type { EditorDocument } from '../../../../features/editor/document/types';
import type { PreparedAppliedDocument } from '..';

export type AppliedDocumentCanvasLoadCallbacks = {
  prepareObject: (object: FabricObject) => void;
  upgradeLegacyArrowObjects: () => void;
  syncBackgroundLayer?: (
    frame: EditorDocument['frame'],
    canvasSize: { width: number; height: number }
  ) => Promise<void>;
  rebuildFrameDecorations: () => Promise<void>;
};

export type LoadPreparedDocumentOptions = {
  canvas: Canvas;
  prepared: PreparedAppliedDocument;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
};
