import {
  createReviewSpatialRenderer,
  type ReviewSpatialRenderer,
} from '../../features/video/composition/canvas/spatial-renderer';
import { calculateSpatialRenderAllocations } from './spatial-render-allocation';
import {
  createPreviewRenderResources,
  PreviewRenderResourceError,
} from './preview-render-resources';

type Allocation = ReturnType<typeof calculateSpatialRenderAllocations>[number];

/** Owns standalone spatial admission and disposal. Shared preview supplies its existing ledger. */
export function createReviewSpatialSession(onContextLost?: () => void) {
  const capacities = new Map(
    calculateSpatialRenderAllocations({
      plane: { width: 1, height: 1 },
      output: { width: 1, height: 1 },
      halfFloat: true,
    }).map((allocation) => [allocation.role, allocation])
  );
  const limits = () => {
    const maximumManagedBytes = [...capacities.values()].reduce(
      (total, allocation) => total + allocation.bytes,
      0
    );
    if (!Number.isSafeInteger(maximumManagedBytes)) throw new PreviewRenderResourceError();
    return { maximumCanvases: 3, maximumManagedBytes };
  };
  const resources = createPreviewRenderResources(limits());
  let renderer: ReturnType<typeof createReviewSpatialRenderer> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      renderer?.dispose();
    } finally {
      resources.dispose();
    }
  };
  try {
    renderer = createReviewSpatialRenderer(() => {
      if (disposed) return;
      dispose();
      onContextLost?.();
    }, resources);
  } catch (error) {
    dispose();
    throw error;
  }
  const current = renderer;
  const assertLive = () => {
    if (disposed) throw new Error('Perspective context was lost.');
  };
  const admit = (allocations: readonly Allocation[]) => {
    for (const allocation of allocations) {
      const previous = capacities.get(allocation.role);
      if (!previous || previous.bytes < allocation.bytes)
        capacities.set(allocation.role, allocation);
    }
    // Maximum cost for each role covers retained slots while another surface or texture changes size.
    resources.replaceLimits(limits());
  };
  return {
    get allocations() {
      return current.allocations;
    },
    /** Counts managed estimates. Browser decoder and driver storage remain outside this ledger. */
    get resourceCounters() {
      return resources.counters;
    },
    validateSizes(...args: Parameters<ReviewSpatialRenderer['validateSizes']>) {
      assertLive();
      current.validateSizes(...args);
    },
    surface(...args: Parameters<ReviewSpatialRenderer['surface']>) {
      assertLive();
      const [kind, width, height] = args;
      const size = { width, height };
      const minimum = { width: 1, height: 1 };
      current.validateSizes(
        kind === 'exposure' ? minimum : size,
        kind === 'exposure' ? size : minimum
      );
      try {
        admit([{ role: `spatial-${kind}`, bytes: width * height * 4, canvases: 1 }]);
        return current.surface(...args);
      } catch (error) {
        dispose();
        throw error;
      }
    },
    draw(...args: Parameters<ReviewSpatialRenderer['draw']>) {
      assertLive();
      const [, request] = args;
      current.validateSizes(request.source, request.output);
      try {
        admit(
          calculateSpatialRenderAllocations({
            plane: request.source,
            output: request.output,
            halfFloat: true,
          }).filter((allocation) => allocation.canvases === 0)
        );
        current.draw(...args);
      } catch (error) {
        dispose();
        throw error;
      }
    },
    dispose,
  };
}
