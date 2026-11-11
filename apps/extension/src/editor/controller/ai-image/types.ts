import type { Canvas, FabricObject, TMat2D } from 'fabric';
import type { ImageContext, ImageRaster } from '../../../contracts/ai/image';
import type { EditorControllerPublicApiAdapter } from '../public-api/types';

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type ImageIntention = ImageContext['intention'];
export type ImageCaptureContext = 'region' | 'surroundings' | 'whole';
interface ImageSourceBinding {
  object: FabricObject;
  signature: string;
  parent: FabricObject | undefined;
}
/** Frozen material and live identities are session-only and never enter document serialization. */
export interface EditorImageSnapshot {
  id: string;
  intention: ImageIntention;
  canvas: Canvas;
  originalDocument: EditorControllerPublicApiAdapter['originalDocument'];
  sourceTransform: TMat2D | null;
  sourceId: string;
  sourceDataUrl: string;
  sources: ImageSourceBinding[];
  order: FabricObject[];
  raster: ImageRaster | null;
  captureRaster: ImageRaster | null;
  captureBounds: ImageBounds;
  contextMode: ImageCaptureContext;
  regionSource: 'canvas' | 'source';
  inputBounds: ImageBounds;
  targetBounds: ImageBounds;
  names: string[];
  replacementAllowed: boolean;
}
export type ImageApplyController = Pick<
  EditorControllerPublicApiAdapter,
  | 'canvas'
  | 'source'
  | 'prepareObject'
  | 'setSource'
  | 'commitHistory'
  | 'syncRuntimeState'
  | 'originalDocument'
  | 'withHistoryMuted'
  | 'ensureBrowserFrameOnTop'
  | 'canvasDocumentSize'
>;
/** The receipt binds Update to the exact object produced by Apply. */
export interface ImageApplyReceipt {
  object: FabricObject;
  signature: string;
  readonly objectId?: string;
  sourceDataUrl?: string;
}
