import type { mapVisualLayerToViewportSpace } from '../../../features/video/composition/motion/layer-camera';

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
        segmentLayer.effectActionsOnly ? { ...layer, effectActionsOnly: true } : layer
      );
    }
  }
  return resolvedLayers;
}
