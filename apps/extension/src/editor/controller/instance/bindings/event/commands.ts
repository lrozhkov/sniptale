import { fireAndReportEditorAction } from '../../../../runtime/async-actions';
import type { EditorSelectionNudge } from '../../../tools/nudge';
import type { EditorControllerInstance } from '../../types';

export function createEditorControllerEventCommandBindings(controller: EditorControllerInstance) {
  return {
    cancelTransientInteraction: () => controller.cancelTransientInteraction(),
    undo: () => fireAndReportEditorAction('keyboard-undo', () => controller.undo()),
    redo: () => fireAndReportEditorAction('keyboard-redo', () => controller.redo()),
    duplicateSelection: () =>
      fireAndReportEditorAction('keyboard-duplicate-selection', () =>
        controller.duplicateSelection()
      ),
    nudgeSelection: (nudge: EditorSelectionNudge) => controller.nudgeSelection(nudge),
    finalizeSelectionNudge: (code?: string) => controller.finalizeSelectionNudge(code),
    deleteSelection: () => controller.deleteSelection(),
    applyCropSelection: () =>
      fireAndReportEditorAction('keyboard-apply-crop-selection', () =>
        controller.applyCropSelection()
      ),
    applyTextSelectionStyle: (command: Parameters<typeof controller.applyTextSelectionStyle>[0]) =>
      controller.applyTextSelectionStyle(command),
    commitHistory: () => controller.commitHistory(),
    syncRuntimeState: () => controller.syncRuntimeState(),
    syncViewportState: () => controller.syncViewportState(),
    zoomViewportAtPoint: (delta: number, point: { clientX: number; clientY: number }) =>
      controller.setZoomAtViewportPoint(controller.zoomLevel * delta, point),
  };
}
