import type { EditorRasterTargetReference } from '../../../raster/types';
import type { EditorControllerInstance } from '../../types';

export type MockEditorController = EditorControllerInstance & {
  applyRasterBitmap: (
    reference: EditorRasterTargetReference,
    bitmap: HTMLCanvasElement
  ) => Promise<void>;
  clearRasterSelection: () => void;
  renderRasterOverlay: (
    context: CanvasRenderingContext2D,
    size: { width: number; height: number }
  ) => void;
  subscribeRasterOverlay: (listener: () => void) => () => void;
};
