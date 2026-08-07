import type { Canvas, FabricObject } from 'fabric';

export interface EditorFrameAnnotationPlaneController {
  canvas: Canvas | null;
  canvasDocumentSize: { width: number; height: number };
  clearFrameAnnotationSnap?: () => void;
  bringForwardSelection?: () => void;
  clearSelection?: () => void;
  commitHistory: () => void;
  prepareObject: (object: FabricObject) => void;
  selectLayer?: (id: string, options?: { focusViewport?: boolean }) => void;
  sendBackwardSelection?: () => void;
  snapFrameAnnotationRect?: (input: {
    excludeId?: string;
    rect: { x: number; y: number; width: number; height: number };
  }) => { x: number; y: number; width: number; height: number };
  syncRuntimeState: () => void;
  toggleLayerLock?: (id: string) => void;
}
