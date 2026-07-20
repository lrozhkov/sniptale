import type { Canvas } from 'fabric';
import type { RichShapeGroup } from '../../objects/rich-shape';
import type { HiddenTextObject } from './session-lifecycle';

export interface TextEditorSession {
  readonly element: HTMLTextAreaElement;
  readonly objectId: string;
  readonly originalText: string;
  closing: boolean;
  cleanup: () => void;
  dirty: boolean;
  hiddenTextObjects: HiddenTextObject[];
}

export interface RichShapeTextEditorOwner {
  canvas: Canvas | null;
  commitHistory: () => void;
  syncRuntimeState: () => void;
  withHistoryMuted: <T>(callback: () => T) => T;
}

export interface RichShapeTextEditorStartOptions {
  canvas: Canvas;
  object: RichShapeGroup;
  owner: RichShapeTextEditorOwner;
}
