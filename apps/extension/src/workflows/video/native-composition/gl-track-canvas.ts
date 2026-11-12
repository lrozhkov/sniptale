import { createGlTransitionCanvas } from '../../../features/video/composition/canvas/gl-transition';
import type { RenderCanvasLease } from '../../../features/video/composition/canvas/render-resources';
import type { GlTrackNode } from '../../../features/video/project/transition/gl-track-plan';
import {
  assertEffectRasterDimensions,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
} from '../../../features/video/composition/effect-runtime/runtime/resource-limits';
import { createPreviewRenderResources } from '../../video-review/preview-render-resources';

export type NativeGlTrackCanvasTarget = Pick<RenderCanvasLease, 'canvas' | 'context'> & {
  /** Synchronous read-only backdrop snapshot; its surface is released after the paint returns. */
  withScratch(paint: (surface: Pick<RenderCanvasLease, 'canvas' | 'context'>) => void): void;
};

/** Serial Canvas execution of the canonical track tree; sources remain borrowed through copying. */
export function createNativeGlTrackCanvas(
  ownerDocument: Pick<Document, 'createElement'>,
  createBackend: typeof createGlTransitionCanvas = createGlTransitionCanvas
) {
  const limits = EFFECT_RUNTIME_RESOURCE_LIMITS;
  const resources = createPreviewRenderResources({
    maximumCanvases: limits.maxLiveCanvases,
    maximumManagedBytes:
      limits.maxAggregateCanvasPixelsPerFrame * 4 + limits.maxOutputPixels * 12 + 32768,
    createCanvas: () => ownerDocument.createElement('canvas'),
  });
  const gl = createBackend({
    ownerDocument,
    reserve: (bytes) => resources.bytes('native-overlap-gl', bytes),
  });
  const lifetime = new AbortController();
  let active = false,
    disposed = false;
  const retire = () => {
    if (disposed && !active) resources.dispose();
  };
  return {
    async render(request: {
      root: GlTrackNode;
      width: number;
      height: number;
      ratio: number;
      signal: AbortSignal;
      paintState(target: NativeGlTrackCanvasTarget, clipIds: readonly string[]): Promise<void>;
    }): Promise<RenderCanvasLease> {
      if (disposed) throw new Error('Native transition renderer is disposed.');
      if (active) throw new Error('Native transition frame is already in flight.');
      assertEffectRasterDimensions(request.width, request.height);
      if (!Number.isFinite(request.ratio) || request.ratio <= 0)
        throw new Error('Invalid transition aspect ratio.');
      const signal = AbortSignal.any([request.signal, lifetime.signal]);
      signal.throwIfAborted();
      active = true;
      let handedOff = false;
      const held = new Set<RenderCanvasLease>();
      const allocate = () => {
        const surface = resources.canvas('native-overlap-state', request);
        held.add(surface);
        return surface;
      };
      const release = (surface: RenderCanvasLease) => {
        held.delete(surface);
        surface.release();
      };
      const evaluate = async (node: GlTrackNode): Promise<RenderCanvasLease> => {
        signal.throwIfAborted();
        if (node.kind === 'state') {
          const surface = allocate();
          await request.paintState(
            {
              canvas: surface.canvas,
              context: surface.context,
              withScratch(paint) {
                signal.throwIfAborted();
                const scratch = allocate();
                try {
                  paint(scratch);
                } finally {
                  release(scratch);
                }
              },
            },
            node.clipIds
          );
          signal.throwIfAborted();
          return surface;
        }
        const before = await evaluate(node.before);
        const after = await evaluate(node.after);
        const output = allocate();
        await gl.render({
          context: output.context,
          from: before.canvas,
          to: after.canvas,
          width: request.width,
          height: request.height,
          ratio: request.ratio,
          selection: node.junction.selection,
          progress: node.junction.progress,
          signal,
        });
        signal.throwIfAborted();
        release(before);
        release(after);
        return output;
      };
      try {
        const result = await evaluate(request.root);
        signal.throwIfAborted();
        held.delete(result);
        handedOff = true;
        let released = false;
        return {
          canvas: result.canvas,
          context: result.context,
          release() {
            if (released) return;
            released = true;
            result.release();
            active = false;
            retire();
          },
        };
      } finally {
        for (const surface of held) surface.release();
        if (!handedOff) {
          active = false;
          retire();
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      gl.dispose();
      retire();
    },
  };
}
