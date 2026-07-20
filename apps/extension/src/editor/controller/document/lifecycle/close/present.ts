import { resetClosedEditorCanvas } from './canvas';
import { resetClosedEditorControllerState } from './controller';
import { renderClosedEditorCanvas } from './render';
import type { CloseEditorControllerCanvasOptions } from './types';

export function closeEditorControllerDocumentWithCanvas(
  options: CloseEditorControllerCanvasOptions
): void {
  resetClosedEditorCanvas(options);
  resetClosedEditorControllerState(options);
  renderClosedEditorCanvas(options.canvas);
}
