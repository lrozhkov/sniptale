import { groupSelectedEditorLayers, ungroupSelectedEditorLayers } from '../../layer-actions/group';
import type { EditorControllerInstance } from '../types';

export function groupSelectedLayersForController(controller: EditorControllerInstance): boolean {
  return groupSelectedEditorLayers(controller.getPublicApiAdapter());
}

export function ungroupSelectedLayersForController(controller: EditorControllerInstance): boolean {
  return ungroupSelectedEditorLayers(controller.getPublicApiAdapter());
}
