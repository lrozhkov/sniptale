import { useEditorStore } from '../../../../state/useEditorStore';
import { createCloseEditorControllerCanvasOptions } from '../../params';
import { renderClosedEditorCanvas, resetClosedEditorCanvas } from './canvas';
import type {
  CloseEditorControllerCanvasOptions,
  CloseEditorControllerDocumentOptions,
  CloseEditorControllerStateOptions,
} from './types';

function resetClosedEditorStoreState(): void {
  useEditorStore.getState().resetDocumentState();
}

function resetClosedEditorControllerState(options: CloseEditorControllerStateOptions): void {
  options.setDrawSession(null);
  options.setCropState(null, null);
  options.setSource(null);
  options.setOriginalDocument(null);
  options.setHistory(null);
  options.setActiveTool('select');
  options.setZoomLevel(1);
  options.setPanSession(null);
  resetClosedEditorStoreState();
}

function closeEditorControllerDocumentWithCanvas(
  options: CloseEditorControllerCanvasOptions
): void {
  resetClosedEditorCanvas(options);
  resetClosedEditorControllerState(options);
  renderClosedEditorCanvas(options.canvas);
}

export function closeEditorControllerDocument(options: CloseEditorControllerDocumentOptions): void {
  if (!options.canvas) {
    resetClosedEditorStoreState();
    return;
  }

  closeEditorControllerDocumentWithCanvas(
    createCloseEditorControllerCanvasOptions(options, options.canvas)
  );
}
