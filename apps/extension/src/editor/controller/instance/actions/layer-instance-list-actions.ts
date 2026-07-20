import {
  reorderEditorControllerLayer,
  selectEditorControllerLayer,
} from '../../public-api/layer-selection-actions';
import {
  renameEditorControllerLayer,
  toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility,
} from '../../public-api/layer-metadata-actions';
import type { EditorControllerInstance } from '../types';

export function reorderLayerForController(
  controller: EditorControllerInstance,
  draggedId: string,
  targetId: string
): void {
  reorderEditorControllerLayer(controller.getPublicApiAdapter(), draggedId, targetId);
}

export function selectLayerForController(
  controller: EditorControllerInstance,
  id: string,
  options: { additive?: boolean; range?: boolean; toggle?: boolean } = {}
): void {
  selectEditorControllerLayer(controller.getPublicApiAdapter(), id, options);
}

export function renameLayerForController(
  controller: EditorControllerInstance,
  id: string,
  name: string
): void {
  renameEditorControllerLayer(controller.getPublicApiAdapter(), id, name);
}

export function toggleLayerVisibilityForController(
  controller: EditorControllerInstance,
  id: string
): void {
  toggleEditorControllerLayerVisibility(controller.getPublicApiAdapter(), id);
}

export function toggleLayerLockForController(
  controller: EditorControllerInstance,
  id: string
): void {
  toggleEditorControllerLayerLock(controller.getPublicApiAdapter(), id);
}
