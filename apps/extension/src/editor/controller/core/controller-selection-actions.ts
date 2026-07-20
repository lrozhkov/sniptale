import type { EditorTextInlineStyleCommand } from '../text-formatting';
import type { EditorSelectionNudge } from '../tools/nudge';
import type { EditorTechnicalDataKind, EditorTechnicalDataLayout } from '../tools/technical-data';
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
  sendBackwardSelectionForController,
  sendSelectionToBackForController,
  undoForController,
} from '../instance/actions/selection';
import { ImageEditorControllerLifecycleActions } from './controller-lifecycle-actions';

export abstract class ImageEditorControllerSelectionActions extends ImageEditorControllerLifecycleActions {
  applyActiveSettingsToSelection() {
    applySelectionSettingsForController(this.getControllerInstance());
  }

  previewActiveSettingsOnSelection() {
    previewSelectionSettingsForController(this.getControllerInstance());
  }

  applyTextSelectionStyle(command: EditorTextInlineStyleCommand) {
    return applyTextSelectionStyleForController(this.getControllerInstance(), command);
  }

  async undo() {
    await undoForController(this.getControllerInstance());
  }

  async redo() {
    await redoForController(this.getControllerInstance());
  }

  async resetToOriginal() {
    await resetToOriginalForController(this.getControllerInstance());
  }

  deleteSelection() {
    deleteSelectionForController(this.getControllerInstance());
  }

  async duplicateSelection() {
    await duplicateSelectionForController(this.getControllerInstance());
  }

  nudgeSelection(nudge: EditorSelectionNudge) {
    return nudgeSelectionForController(this.getControllerInstance(), nudge);
  }

  finalizeSelectionNudge(code?: string) {
    finalizeSelectionNudgeForController(this.getControllerInstance(), code);
  }

  bringForwardSelection() {
    bringForwardSelectionForController(this.getControllerInstance());
  }

  sendBackwardSelection() {
    sendBackwardSelectionForController(this.getControllerInstance());
  }

  bringSelectionToFront() {
    bringSelectionToFrontForController(this.getControllerInstance());
  }

  sendSelectionToBack() {
    sendSelectionToBackForController(this.getControllerInstance());
  }

  async insertImage(dataUrl: string, name: string | null = null) {
    await insertImageForController(this.getControllerInstance(), dataUrl, name);
  }

  insertRichShape(id: string, o?: { rough?: unknown; customDefinition?: unknown }) {
    insertRichShapeForController(this.getControllerInstance(), id, o);
  }

  insertTechnicalData(
    kinds: readonly EditorTechnicalDataKind[],
    layout: EditorTechnicalDataLayout = 'column'
  ) {
    insertTechnicalDataForController(this.getControllerInstance(), kinds, layout);
  }
}
