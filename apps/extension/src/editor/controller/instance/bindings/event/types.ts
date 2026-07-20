import type { EditorControllerInstance } from '../../types';
import type { EditorRasterTargetReference } from '../../../raster/types';

export type RasterCommandController = EditorControllerInstance & {
  applyRasterBitmap: (
    reference: EditorRasterTargetReference,
    bitmap: HTMLCanvasElement
  ) => Promise<void>;
  clearRasterSelection: () => void;
};
