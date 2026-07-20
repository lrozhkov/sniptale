import { mergeEditorControllerSelectedLayers } from '../../public-api/layer-raster-actions/merge';
import { resizeEditorControllerLayer } from '../../public-api/layer-raster-actions/resize';
import type { EditorControllerInstance } from '../types';

export function resizeLayerForController(
  controller: EditorControllerInstance,
  id: string,
  width: number,
  height: number
): void {
  resizeEditorControllerLayer(controller.getPublicApiAdapter(), id, width, height);
}

export async function mergeSelectedLayersForController(
  controller: EditorControllerInstance
): Promise<void> {
  await mergeEditorControllerSelectedLayers(controller.getPublicApiAdapter());
}
