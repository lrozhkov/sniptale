import { resetClosedEditorStoreState } from './store';
import type { CloseEditorControllerStateOptions } from './types';

export function resetClosedEditorControllerState(options: CloseEditorControllerStateOptions): void {
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
