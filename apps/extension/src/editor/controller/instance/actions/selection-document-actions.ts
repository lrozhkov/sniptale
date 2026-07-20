import {
  applyEditorSelectionSettingsViaController,
  deleteEditorControllerSelection,
  duplicateEditorControllerSelection,
  previewEditorSelectionSettingsViaController,
  redoEditorControllerSnapshot,
  resetEditorControllerToOriginal,
  undoEditorControllerSnapshot,
} from '../../public-api';
import {
  applyEditorTextSelectionStyle,
  type EditorTextInlineStyleCommand,
} from '../../text-formatting';
import type { EditorControllerInstance } from '../types';

export function applySelectionSettingsForController(controller: EditorControllerInstance): void {
  applyEditorSelectionSettingsViaController(controller.getPublicApiAdapter());
}

export function previewSelectionSettingsForController(controller: EditorControllerInstance): void {
  previewEditorSelectionSettingsViaController(controller.getPublicApiAdapter());
}

export function applyTextSelectionStyleForController(
  controller: EditorControllerInstance,
  command: EditorTextInlineStyleCommand
): boolean {
  return applyEditorTextSelectionStyle(controller.getPublicApiAdapter(), command);
}

export async function undoForController(controller: EditorControllerInstance): Promise<void> {
  await undoEditorControllerSnapshot(controller.getPublicApiAdapter());
}

export async function redoForController(controller: EditorControllerInstance): Promise<void> {
  await redoEditorControllerSnapshot(controller.getPublicApiAdapter());
}

export async function resetToOriginalForController(
  controller: EditorControllerInstance
): Promise<void> {
  await resetEditorControllerToOriginal(controller.getPublicApiAdapter());
}

export function deleteSelectionForController(controller: EditorControllerInstance): void {
  deleteEditorControllerSelection(controller.getPublicApiAdapter());
}

export async function duplicateSelectionForController(
  controller: EditorControllerInstance
): Promise<void> {
  await duplicateEditorControllerSelection(controller.getPublicApiAdapter());
}
