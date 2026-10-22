import type { VideoCompositionSpotlightState } from './types';
import type { mapVisualLayerToViewportSpace } from './motion/layer-camera';

type ViewportLayer = ReturnType<typeof mapVisualLayerToViewportSpace>;

export function resolveOrderedVisualPassLayers(
  layers: ViewportLayer[],
  passLayers: ViewportLayer[]
): ViewportLayer[] {
  const resolvedLayers: ViewportLayer[] = [];
  for (const segmentLayer of layers) {
    const layer = passLayers.find((candidate) => candidate.clipId === segmentLayer.clipId);
    if (layer) {
      resolvedLayers.push(
        layer.kind === 'video' && segmentLayer.kind === 'video' && layer !== segmentLayer
          ? {
              ...layer,
              ...(segmentLayer.effectActionsOnly ? { effectActionsOnly: true } : {}),
              ...(segmentLayer.deferSourceBorders ? { deferSourceBorders: true } : {}),
              ...(segmentLayer.actions?.length === 0 ? { actions: [] } : {}),
              ...(segmentLayer.borders?.length === 0 ? { borders: [] } : {}),
            }
          : layer
      );
    }
  }
  return resolvedLayers;
}

/** Keep authored order and finish each source exposure before its post-projection scene mask. */
export function splitVisualLayersForSourceSpotlights(
  layers: ViewportLayer[],
  spotlights: readonly VideoCompositionSpotlightState[] = []
): Array<{ layers: ViewportLayer[]; afterClipId?: string }> {
  const sources = new Set(
    spotlights.flatMap((state) => (state.afterClipId ? [state.afterClipId] : []))
  );
  const positions = new Map(
    layers.flatMap((layer, index) =>
      !layer.effectActionsOnly && !layer.effectViewportRaster
        ? [[layer.clipId, index] as const]
        : []
    )
  );
  const available = new Set(positions.keys());
  const deferredAt = new Map<string, string>();
  for (const state of spotlights) {
    if (!state.afterClipId || !available.has(state.afterClipId)) continue;
    const owners = state.sourceTransition
      ? [state.sourceTransition.leadingClipId, state.sourceTransition.trailingClipId]
      : state.clipId
        ? [state.clipId]
        : [state.afterClipId];
    for (const id of owners) {
      const current = deferredAt.get(id);
      if (!current || positions.get(state.afterClipId)! > positions.get(current)!)
        deferredAt.set(id, state.afterClipId);
    }
  }
  const result: Array<{ layers: ViewportLayer[]; afterClipId?: string }> = [];
  const deferred = new Map<string, ViewportLayer[]>();
  const emitted = new Set<string>();
  const queue = (boundary: string, layer: ViewportLayer) => {
    const list = deferred.get(boundary) ?? [];
    list.push(layer);
    deferred.set(boundary, list);
  };
  let pending: ViewportLayer[] = [];
  for (const layer of layers) {
    const boundary = deferredAt.get(layer.clipId);
    if (layer.effectActionsOnly && boundary && !emitted.has(boundary)) {
      queue(boundary, layer);
      continue;
    }
    const defer =
      layer.kind === 'video' && !layer.effectActionsOnly && !layer.effectViewportRaster && boundary;
    const hasExplicitActions =
      defer &&
      layers.some((candidate) => candidate.clipId === layer.clipId && candidate.effectActionsOnly);
    if (defer && (layer.borders?.length || (!hasExplicitActions && layer.actions?.length)))
      queue(boundary, {
        ...layer,
        effectActionsOnly: true,
        deferSourceBorders: true,
        ...(hasExplicitActions ? { actions: [] } : {}),
      });
    pending.push(
      defer && layer.kind === 'video' && (layer.actions?.length || layer.borders?.length)
        ? { ...layer, actions: [], borders: [] }
        : layer
    );
    if (!layer.effectActionsOnly && !layer.effectViewportRaster && sources.delete(layer.clipId)) {
      result.push({ layers: pending, afterClipId: layer.clipId });
      pending = deferred.get(layer.clipId) ?? [];
      deferred.delete(layer.clipId);
      emitted.add(layer.clipId);
    }
  }
  if (pending.length) result.push({ layers: pending });
  return result;
}
