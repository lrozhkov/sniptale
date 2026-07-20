import type { Canvas, FabricObject } from 'fabric';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { ApplyDocumentOptions } from '../core/types';
import type { SourceState } from '../../document/model/source-state';

type CanvasDocumentSize = { width: number; height: number };

interface ApplyEditorControllerDocumentStateSetters {
  setCanvasDocumentSize: (size: CanvasDocumentSize) => void;
  setSource: (source: SourceState | null) => void;
  setCropState: (cropGuide: null, cropSelection: null) => void;
  setActiveTool: (tool: string) => void;
  setOriginalDocument: (document: EditorDocument) => void;
  setHistory: (document: EditorDocument) => void;
}

interface ApplyEditorControllerDocumentLifecycleActions {
  prepareObject: (object: FabricObject) => void;
  syncBackgroundLayer?: (
    frame: EditorDocument['frame'],
    canvasSize: CanvasDocumentSize
  ) => Promise<void>;
  rebuildFrameDecorations: () => Promise<void>;
  applyToolMode: () => void;
}

interface ApplyEditorControllerDocumentSharedOptions
  extends ApplyEditorControllerDocumentStateSetters, ApplyEditorControllerDocumentLifecycleActions {
  document: EditorDocument;
  zoomLevel: number;
  viewportDevicePixelRatioBaseline?: number;
  hasHistory: boolean;
}

export interface ApplyEditorControllerDocumentStateOptions extends ApplyEditorControllerDocumentSharedOptions {
  canvas: Canvas;
  applyOptions: ApplyDocumentOptions;
}

export interface ApplyEditorControllerDocumentOptions extends ApplyEditorControllerDocumentSharedOptions {
  canvas: Canvas | null;
  applyOptions?: ApplyDocumentOptions;
  options?: ApplyDocumentOptions;
  syncRuntimeState: () => void;
}
