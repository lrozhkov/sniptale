import { mergeEditorSelectedLayers } from '../../layer-effects/merge';
import {
  createControllerLayerMutationContext,
  type LayerRasterMutationContextController,
} from './context';

export async function mergeEditorControllerSelectedLayers(
  controller: LayerRasterMutationContextController
): Promise<void> {
  await mergeEditorSelectedLayers(createControllerLayerMutationContext(controller));
}
