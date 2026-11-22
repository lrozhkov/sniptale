import { flushEditorFreehandCompletion } from '../draw-workflow/released';
import type { EditorTextInlineStyleCommand } from '../text-formatting';
import type { EditorDocument } from '../../../features/editor/document/types';
import type { EditorSelectionNudge } from '../tools/nudge';
import type {
  EditorTechnicalDataKind,
  EditorTechnicalDataLayout,
} from '../../../features/editor/document/technical-data';
import {
  applySelectionSettingsForController,
  applyTextSelectionStyleForController,
  bringForwardSelectionForController,
  bringSelectionToFrontForController,
  deleteSelectionForController,
  duplicateSelectionForController,
  finalizeSelectionNudgeForController,
  insertImageForController,
  insertRichShapeForController,
  insertTechnicalDataForController,
  nudgeSelectionForController,
  previewSelectionSettingsForController,
  redoForController,
  resetToOriginalForController,
  restoreOriginalDocumentForController,
  sendBackwardSelectionForController,
  sendSelectionToBackForController,
  undoForController,
} from '../instance/actions/selection';
import { ImageEditorControllerLifecycleActions } from './controller-lifecycle-actions';
import { readEditorHistoryEntries } from '../history';
import { seekEditorControllerSnapshot } from '../public-api/document';

export abstract class ImageEditorControllerSelectionActions extends ImageEditorControllerLifecycleActions {
  applyActiveSettingsToSelection() {
    flushEditorFreehandCompletion(this.canvas);
    applySelectionSettingsForController(this.getControllerInstance());
  }

  previewActiveSettingsOnSelection() {
    flushEditorFreehandCompletion(this.canvas);
    previewSelectionSettingsForController(this.getControllerInstance());
  }

  applyTextSelectionStyle(command: EditorTextInlineStyleCommand) {
    flushEditorFreehandCompletion(this.canvas);
    return applyTextSelectionStyleForController(this.getControllerInstance(), command);
  }

  async undo() {
    flushEditorFreehandCompletion(this.canvas);
    await undoForController(this.getControllerInstance());
  }

  async redo() {
    flushEditorFreehandCompletion(this.canvas);
    await redoForController(this.getControllerInstance());
  }

  getHistoryEntries() {
    return readEditorHistoryEntries(this.history);
  }

  async seekHistory(index: number) {
    flushEditorFreehandCompletion(this.canvas);
    await seekEditorControllerSnapshot(this.getPublicApiAdapter(), index);
  }

  async resetToOriginal() {
    flushEditorFreehandCompletion(this.canvas);
    await resetToOriginalForController(this.getControllerInstance());
  }

  async restoreOriginalDocument(original: EditorDocument, isCurrent: () => boolean) {
    flushEditorFreehandCompletion(this.canvas);
    await restoreOriginalDocumentForController(this.getControllerInstance(), original, isCurrent);
  }

  deleteSelection() {
    flushEditorFreehandCompletion(this.canvas);
    deleteSelectionForController(this.getControllerInstance());
  }

  async duplicateSelection() {
    flushEditorFreehandCompletion(this.canvas);
    await duplicateSelectionForController(this.getControllerInstance());
  }

  nudgeSelection(nudge: EditorSelectionNudge) {
    flushEditorFreehandCompletion(this.canvas);
    return nudgeSelectionForController(this.getControllerInstance(), nudge);
  }

  finalizeSelectionNudge(code?: string) {
    flushEditorFreehandCompletion(this.canvas);
    finalizeSelectionNudgeForController(this.getControllerInstance(), code);
  }

  bringForwardSelection() {
    flushEditorFreehandCompletion(this.canvas);
    bringForwardSelectionForController(this.getControllerInstance());
  }

  sendBackwardSelection() {
    flushEditorFreehandCompletion(this.canvas);
    sendBackwardSelectionForController(this.getControllerInstance());
  }

  bringSelectionToFront() {
    flushEditorFreehandCompletion(this.canvas);
    bringSelectionToFrontForController(this.getControllerInstance());
  }

  sendSelectionToBack() {
    flushEditorFreehandCompletion(this.canvas);
    sendSelectionToBackForController(this.getControllerInstance());
  }

  async insertImage(dataUrl: string, name: string | null = null) {
    flushEditorFreehandCompletion(this.canvas);
    await insertImageForController(this.getControllerInstance(), dataUrl, name);
  }

  insertRichShape(id: string, o?: { rough?: unknown; customDefinition?: unknown }) {
    flushEditorFreehandCompletion(this.canvas);
    insertRichShapeForController(this.getControllerInstance(), id, o);
  }

  insertTechnicalData(
    kinds: readonly EditorTechnicalDataKind[],
    layout: EditorTechnicalDataLayout = 'column'
  ) {
    flushEditorFreehandCompletion(this.canvas);
    insertTechnicalDataForController(this.getControllerInstance(), kinds, layout);
  }
}
