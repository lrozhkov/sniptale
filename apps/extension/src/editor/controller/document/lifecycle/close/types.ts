import type { Canvas } from 'fabric';
import type { EditorDocument } from '../../../../../features/editor/document/types';

import type { SourceState } from '../../../../document/model/source-state';

type CanvasDocumentSize = { width: number; height: number };

interface CloseEditorControllerStateActions {
  setDrawSession: (session: null) => void;
  setCropState: (cropGuide: null, cropSelection: null) => void;
  setSource: (source: SourceState | null) => void;
  setOriginalDocument: (document: EditorDocument | null) => void;
  setHistory: (document: null) => void;
  setActiveTool: (tool: 'select') => void;
  setZoomLevel: (zoomLevel: number) => void;
  setPanSession: (session: null) => void;
}

interface CloseEditorControllerCanvasActions {
  setCanvasDocumentSize: (size: CanvasDocumentSize) => void;
}

export type CloseEditorControllerStateOptions = CloseEditorControllerStateActions;

export interface CloseEditorControllerCanvasOptions
  extends CloseEditorControllerStateOptions, CloseEditorControllerCanvasActions {
  canvas: Canvas;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
}

export interface CloseEditorControllerDocumentOptions
  extends CloseEditorControllerStateOptions, CloseEditorControllerCanvasActions {
  canvas: Canvas | null;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
}
