import { applyEditorLayerTransformation } from '../../layer-effects/raster-mutations/transform';
import type { EditorLayerTransformationId } from '../../layer-effects/registry';
import {
  createControllerLayerMutationContext,
  type LayerRasterMutationContextController,
} from './context';

export async function applyEditorControllerLayerTransformation(
  controller: LayerRasterMutationContextController,
  id: string,
  transformationId: EditorLayerTransformationId
): Promise<void> {
  await applyEditorLayerTransformation({
    ...createControllerLayerMutationContext(controller),
    id,
    transformationId,
  });
}
