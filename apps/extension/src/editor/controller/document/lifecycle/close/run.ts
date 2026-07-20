import { closeEditorControllerDocumentWithCanvas } from './present';
import { resetClosedEditorStoreState } from './store';
import type { CloseEditorControllerDocumentOptions } from './types';
import { createCloseEditorControllerCanvasOptions } from '../../params';

export function closeEditorControllerDocument(options: CloseEditorControllerDocumentOptions): void {
  if (!options.canvas) {
    resetClosedEditorStoreState();
    return;
  }

  closeEditorControllerDocumentWithCanvas(
    createCloseEditorControllerCanvasOptions(options, options.canvas)
  );
}
