import { fireAndReportEditorAction } from '../../../../runtime/async-actions';
import type { EditorSelectionNudge } from '../../../tools/nudge';
import type { EditorRasterTargetReference } from '../../../raster/types';
import {
  copyRasterSelectionForController,
  cutRasterSelectionForController,
  deleteRasterSelectionForController,
  pasteRasterClipboardForController,
} from '../../../raster-tools/controller';
import type { RasterCommandController } from './types';

export function createEditorControllerEventCommandBindings(controller: RasterCommandController) {
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
    clearRasterSelection: () => controller.clearRasterSelection(),
    applyRasterBitmap: (reference: EditorRasterTargetReference, bitmap: HTMLCanvasElement) =>
      controller.applyRasterBitmap(reference, bitmap),
    copyRasterSelection: () =>
      fireAndReportEditorAction('keyboard-copy-raster-selection', async () => {
        await copyRasterSelectionForController(controller);
      }),
    cutRasterSelection: () =>
      fireAndReportEditorAction('keyboard-cut-raster-selection', async () => {
        await cutRasterSelectionForController(controller);
      }),
    deleteRasterSelectionPixels: () =>
      fireAndReportEditorAction('keyboard-delete-raster-selection', async () => {
        await deleteRasterSelectionForController(controller);
      }),
    pasteRasterClipboard: () =>
      fireAndReportEditorAction('keyboard-paste-raster-clipboard', async () => {
        await pasteRasterClipboardForController(controller);
      }),
  };
}
