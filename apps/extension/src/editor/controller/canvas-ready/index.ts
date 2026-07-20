import type { EditorControllerInstance } from '../instance/types';
import { ensureEditorCanvasReadyHandoff } from '../../document/canvas-ready/handoff';

/**
 * Waits until the editor controller has a mounted Fabric canvas.
 * File-open flows can start before the mount effect finishes, so direct
 * `openImage/loadDocument` calls must not proceed against a null canvas.
 */
export function waitForEditorControllerCanvas(
  controller: Pick<EditorControllerInstance, 'canvas'>,
  timeoutMs?: number
): Promise<void> {
  if (controller.canvas) {
    return Promise.resolve();
  }

  return ensureEditorCanvasReadyHandoff(controller).wait(timeoutMs);
}
