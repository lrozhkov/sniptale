import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

export interface EditorSceneLayout {
  canvas: Size;
  content: Rect;
  source: Rect;
  header: Rect | null;
}

export interface ResolveEditorSceneLayoutInput {
  frame: EditorFrameSettings;
  browserFrame: BrowserFrameState;
  hasBrowserFrame?: boolean;
  source: Size;
  canvas?: Size | null;
  preserveCanvasSize: boolean;
  fitSourceToContent: boolean;
}
