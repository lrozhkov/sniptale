import { applyEditorControllerLayerTransformation } from '../../public-api/layer-raster-actions/transform';
import type { EditorLayerTransformationId } from '../../layer-effects/registry';
import type { EditorControllerInstance } from '../types';

export async function applyLayerTransformationForController(
  controller: EditorControllerInstance,
  id: string,
  transformationId: EditorLayerTransformationId
): Promise<void> {
  await applyEditorControllerLayerTransformation(
    controller.getPublicApiAdapter(),
    id,
    transformationId
  );
}
