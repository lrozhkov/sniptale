import {
  renameEditorLayerById,
  toggleEditorLayerLockState,
  toggleEditorLayerVisibility,
} from '../public-actions';
import { createLayerPreparedSourceBindings, createLayerSourceBindings } from './layer-bindings';
import type { EditorControllerPublicApiAdapter } from './types';

export function toggleEditorControllerLayerVisibility(
  controller: EditorControllerPublicApiAdapter,
  id: string
): void {
  toggleEditorLayerVisibility({
    canvas: controller.canvas,
    id,
    source: controller.source,
    ...createLayerSourceBindings(controller),
  });
}

export function toggleEditorControllerLayerLock(
  controller: EditorControllerPublicApiAdapter,
  id: string
): void {
  toggleEditorLayerLockState({
    canvas: controller.canvas,
    id,
    source: controller.source,
    ...createLayerPreparedSourceBindings(controller),
  });
}

export function renameEditorControllerLayer(
  controller: EditorControllerPublicApiAdapter,
  id: string,
  name: string
): void {
  renameEditorLayerById({
    canvas: controller.canvas,
    id,
    name,
    source: controller.source,
    ...createLayerSourceBindings(controller),
  });
}
