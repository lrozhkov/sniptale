import type { EditorRasterToolSessionState } from '../types';

export function createEditorRasterToolSession(): EditorRasterToolSessionState {
  return {
    selection: null,
    marqueeDraft: null,
    lassoDraft: null,
    gradientDraft: null,
    eraserDraft: null,
    brushDraft: null,
    hoverCursor: null,
    overlayListeners: new Set(),
  };
}
