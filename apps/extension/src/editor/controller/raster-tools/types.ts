import type { Point } from 'fabric';
import type { EditorRasterSelectionMask, EditorRasterTargetSnapshot } from '../raster/types';

interface EditorRasterMarqueeDraft {
  snapshot: EditorRasterTargetSnapshot;
  startBitmapPoint: { x: number; y: number };
  currentBitmapPoint: { x: number; y: number };
}

interface EditorRasterLassoDraft {
  snapshot: EditorRasterTargetSnapshot;
  bitmapPoints: { x: number; y: number }[];
  scenePoints: Point[];
}

interface EditorRasterGradientDraft {
  snapshot: EditorRasterTargetSnapshot;
  startBitmapPoint: { x: number; y: number };
  currentBitmapPoint: { x: number; y: number };
  startScenePoint: Point;
  currentScenePoint: Point;
}

interface EditorRasterEraserDraft {
  snapshot: EditorRasterTargetSnapshot;
  bitmapPoints: { x: number; y: number }[];
}

interface EditorRasterBrushDraft {
  changed: boolean;
  createdTarget: boolean;
  snapshot: EditorRasterTargetSnapshot;
  bitmapPoints: { x: number; y: number }[];
}

interface EditorRasterHoverCursor {
  scenePoint: Point;
  tool: 'brush' | 'eraser';
}

interface EditorRasterClipboardState {
  dataUrl: string;
  sceneBounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  source: EditorRasterSelectionMask['reference'];
}

export interface EditorRasterToolSessionState {
  selection: EditorRasterSelectionMask | null;
  clipboard?: EditorRasterClipboardState | null;
  marqueeDraft: EditorRasterMarqueeDraft | null;
  lassoDraft: EditorRasterLassoDraft | null;
  gradientDraft: EditorRasterGradientDraft | null;
  eraserDraft: EditorRasterEraserDraft | null;
  brushDraft: EditorRasterBrushDraft | null;
  hoverCursor: EditorRasterHoverCursor | null;
  overlayListeners: Set<() => void>;
}
