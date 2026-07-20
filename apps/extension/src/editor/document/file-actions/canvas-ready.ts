import type { CanvasReadyPort } from './ports';
import { ensureEditorCanvasReadyHandoff } from '../canvas-ready/handoff';

/**
 * File-open flows can start before the mount effect finishes, so document
 * file actions wait for the injected editor surface to expose its canvas.
 */
export function waitForEditorDocumentCanvas(
  editor: CanvasReadyPort,
  timeoutMs?: number
): Promise<void> {
  if (editor.canvas) {
    return Promise.resolve();
  }

  return ensureEditorCanvasReadyHandoff(editor).wait(timeoutMs);
}
