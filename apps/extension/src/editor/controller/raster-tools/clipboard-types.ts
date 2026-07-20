import type { Canvas, FabricObject } from 'fabric';

import type { SourceState } from '../../document/model/source-state';
import type { EditorRasterTargetReference } from '../raster/types';
import type { EditorRasterToolSessionState } from './types';
import type { RasterClipboardSceneBounds } from './clipboard-insert';

export interface ClipboardControllerLike {
  canvas: Canvas | null;
  rasterToolSession: EditorRasterToolSessionState;
  source: SourceState | null;
  prepareObject: (object: FabricObject) => void;
  nextLabelIndex: (type: 'image') => number;
  commitHistory: () => void;
  syncRuntimeState: () => void;
}

export interface ApplyRasterBitmapTarget {
  applyRasterBitmap: (
    reference: EditorRasterTargetReference,
    bitmap: HTMLCanvasElement
  ) => Promise<void>;
}

export interface RasterClipboardPayload {
  dataUrl: string;
  bitmap: HTMLCanvasElement;
  reference: EditorRasterTargetReference;
  sceneBounds: RasterClipboardSceneBounds;
}
