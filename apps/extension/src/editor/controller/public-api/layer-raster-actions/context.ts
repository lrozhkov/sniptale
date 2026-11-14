import {
  createLayerMutationBindings,
  createLayerReachableSourceBindings,
  type LayerMutationBindingController,
  type LayerReachableSourceBindingController,
} from '../layer-bindings';
import type { EditorControllerPublicApiAdapter } from '../types';
import { getEditorRasterRuntime } from '../../../raster-editing/runtime';
import type { LayerMutationContext } from '../../layer-effects/mutation-shared';

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

/** Use the mounted raster session for correction preparation and preview lifetime. */
export function createControllerLayerCorrectionContext(
  controller: LayerRasterMutationContextController
): LayerMutationContext {
  const context = createControllerLayerMutationContext(controller);
  const runtime = controller.canvas ? getEditorRasterRuntime(controller.canvas) : null;
  if (!runtime) return context;
  return {
    ...context,
    rasterCorrections: {
      reset: () => runtime.clearPreparedPreview(),
      apply: async (id, updateEffects, preview) => {
        await runtime.runCorrectionPreparation(id, async (signal, isCurrent) => {
          await runtime.adapter.hydrateTarget(signal, id);
          const target = runtime.adapter.resolveById(id);
          if (!target || target.permission !== 'allowed' || !isCurrent()) return;
          const effects = updateEffects(
            (target.identity.sniptaleEffects ?? []).map((effect) => ({ ...effect }))
          );
          if (target.kind !== 'background') {
            if (!preview) return;
            const prepared = await runtime.adapter.prepareNativeCorrectionPreview(
              target,
              effects,
              signal
            );
            if (!prepared) return;
            if (!isCurrent() || !runtime.adapter.isCurrent(target)) {
              prepared.dispose();
              return;
            }
            runtime.showPreparedPreview(id, prepared);
            return;
          }
          const candidate = await runtime.adapter.prepareBackgroundCorrection(
            target,
            effects,
            signal
          );
          if (!isCurrent() || !runtime.adapter.isCurrent(target)) return;
          if (!preview) {
            const published = await runtime.publishCorrection(target, candidate, signal);
            if (!published && isCurrent()) throw new Error('Raster correction publication refused');
            return;
          }
          const prepared = await runtime.adapter.prepareCorrectionPreview(
            target,
            candidate,
            signal
          );
          if (!prepared) return;
          if (!isCurrent() || !runtime.adapter.isCurrent(target)) {
            prepared.dispose();
            return;
          }
          runtime.showPreparedPreview(id, prepared);
        });
      },
    },
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
