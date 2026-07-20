import {
  createLayerMutationBindings,
  createLayerReachableSourceBindings,
  type LayerMutationBindingController,
  type LayerReachableSourceBindingController,
} from '../layer-bindings';
import type { EditorControllerPublicApiAdapter } from '../types';

type LayerRasterCanvasSourceController = Pick<
  EditorControllerPublicApiAdapter,
  'canvas' | 'source'
>;

export type LayerRasterMutationContextController = LayerRasterCanvasSourceController &
  LayerMutationBindingController;

export type LayerRasterReachableSourceContextController = LayerRasterCanvasSourceController &
  LayerReachableSourceBindingController &
  Pick<EditorControllerPublicApiAdapter, 'commitHistory'>;

export type LayerRasterResizeContextController = LayerRasterMutationContextController &
  LayerRasterReachableSourceContextController;

export function createControllerLayerMutationContext(
  controller: LayerRasterMutationContextController
) {
  return {
    canvas: controller.canvas,
    source: controller.source,
    ...createLayerMutationBindings(controller),
  };
}

export function createControllerLayerReachableSourceContext(
  controller: LayerRasterReachableSourceContextController
) {
  return {
    canvas: controller.canvas,
    source: controller.source,
    ...createLayerReachableSourceBindings(controller),
    commitHistory: () => controller.commitHistory(),
  };
}
