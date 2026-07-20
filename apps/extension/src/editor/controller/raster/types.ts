import type { Canvas, FabricObject } from 'fabric';

export interface EditorRasterTargetReference {
  kind: 'object';
  objectId: string;
  objectName: string;
}

export interface EditorRasterResolvedTarget {
  object: FabricObject;
  reference: EditorRasterTargetReference;
}

export interface EditorRasterTargetSnapshot {
  reference: EditorRasterTargetReference;
  bitmap: HTMLCanvasElement;
  sceneBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface EditorRasterSelectionMask {
  reference: EditorRasterTargetReference;
  maskCanvas: HTMLCanvasElement;
}

export interface EditorRasterMutationContext {
  canvas: Canvas | null;
  prepareObject: (object: FabricObject) => void;
  sendFrameObjectsToBack: () => void;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  createLayerMutationToken: () => number;
  isLayerMutationTokenCurrent: (token: number) => boolean;
  setSourceFromObject: (object: FabricObject) => void;
}
