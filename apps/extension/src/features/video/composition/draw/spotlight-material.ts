import { createRetainedRasterMaterialOwner } from '../canvas/retained-raster-material';
import type { RenderResources } from '../canvas/render-resources';
import { createSceneSpotlightMasks, type SceneSpotlightLayer } from './spotlight';

type Size = { width: number; height: number };
type Masks = ReturnType<typeof createSceneSpotlightMasks>;
const MAXIMUM_RETAINED_BYTES = 64 * 1024 * 1024;

function contentKey(output: Size, frames: readonly SceneSpotlightLayer[]) {
  return JSON.stringify([
    output.width,
    output.height,
    frames.map((frame) => [
      frame.opening,
      frame.radius,
      frame.dim,
      frame.blur,
      frame.arcMix,
      frame.protectionOpening,
      frame.protectionRadius,
      frame.presence,
      frame.openingClipProgress,
      frame.clip,
      frame.projection,
      frame.blend,
    ]),
  ]);
}

/** Own one immutable mask pair; callers hold a borrow until their GPU reads complete. */
export function createSceneSpotlightMaterialOwner() {
  const retained = createRetainedRasterMaterialOwner<Masks>();
  const unmanaged = {};
  let disposed = false;
  return {
    acquire(
      output: Size,
      frames: readonly SceneSpotlightLayer[],
      resources?: RenderResources
    ): Masks {
      if (disposed) throw new Error('Spotlight material owner is disposed.');
      const bytes =
        Math.max(1, Math.round(output.width)) * Math.max(1, Math.round(output.height)) * 8;
      if (!Number.isSafeInteger(bytes) || bytes > MAXIMUM_RETAINED_BYTES)
        return createSceneSpotlightMasks(output, frames, resources);
      const lease = retained.borrow(resources ?? unmanaged, contentKey(output, frames), () => {
        const identity = crypto.randomUUID();
        const revision = {};
        const masks = createSceneSpotlightMasks(output, frames, resources);
        return {
          value: {
            ...masks,
            cache: {
              dim: { key: `spotlight:${identity}:dim`, revision },
              blur: { key: `spotlight:${identity}:blur`, revision },
            },
          },
          release: masks.dispose,
        };
      });
      return { ...lease.value, dispose: lease.release };
    },
    dispose() {
      disposed = true;
      retained.dispose();
    },
  };
}

export type SceneSpotlightMaterialSource = ReturnType<
  typeof createSceneSpotlightMaterialOwner
>['acquire'];
