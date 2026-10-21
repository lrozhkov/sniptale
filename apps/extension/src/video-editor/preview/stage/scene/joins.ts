import { evaluateCompositionJoin } from '../../../../features/video/project/scene/composition-join';
import { resolveVideoProjectCompositionJoinPlans } from '../../../../features/video/project/scene/joins';
import type { VideoProject } from '../../../../features/video/project/types/model';
import {
  createVideoPreviewFrameMaterializer,
  type VideoPreviewFrameMaterializer,
} from '../../cache/materializer';
import { resolvePreviewCompositionFrameSize, publishPreviewCompositionFrame } from './canvas';
import type { renderPreviewScene } from './render-preview';

type Input = Parameters<typeof renderPreviewScene>[0];
/** Reuses the existing renderer with independent media only while a final join is visible. */
export function createVideoPreviewCompositionJoinRenderer(
  renderCurrent: typeof renderPreviewScene
) {
  let disposed = false;
  let projection: {
    project: VideoProject;
    plans: ReturnType<typeof resolveVideoProjectCompositionJoinPlans>;
  } | null = null;
  let sampler: {
    document: Document;
    key: string;
    controller: AbortController;
    materializer: VideoPreviewFrameMaterializer;
  } | null = null;
  const releaseSampler = () => {
    const previous = sampler;
    sampler = null;
    previous?.controller.abort();
    previous?.materializer.dispose();
  };
  const clear = () => {
    projection = null;
    releaseSampler();
  };
  return {
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
    async render(input: Input): ReturnType<typeof renderPreviewScene> {
      input.signal?.throwIfAborted();
      if (disposed) throw new Error('Preview composition owner is disposed.');
      if (projection?.project !== input.project) {
        clear();
        projection = {
          project: input.project,
          plans: resolveVideoProjectCompositionJoinPlans(input.project),
        };
      }
      const selected = projection.plans.find((plan) =>
        evaluateCompositionJoin(input.currentTime, plan.seam, plan.before, plan.after)
      );
      if (!selected) {
        releaseSampler();
        return renderCurrent(input);
      }
      const rasterSize = resolvePreviewCompositionFrameSize(input);
      if (!rasterSize) return false;
      const assetUrls = input.assetUrls ?? {};
      const key = JSON.stringify({ rasterSize, assetUrls });
      if (!sampler || sampler.document !== input.canvas.ownerDocument || sampler.key !== key) {
        releaseSampler();
        sampler = {
          document: input.canvas.ownerDocument,
          key,
          controller: new AbortController(),
          materializer: createVideoPreviewFrameMaterializer({
            assetUrls,
            ownerDocument: input.canvas.ownerDocument,
            project: input.project,
            rasterSize,
          }),
        };
      }
      const current = sampler;
      const signal = input.signal
        ? AbortSignal.any([input.signal, current.controller.signal])
        : current.controller.signal;
      try {
        const frame = await current.materializer.renderFrame(
          input.currentTime,
          signal,
          input.cameraOverride
        );
        signal.throwIfAborted();
        return publishPreviewCompositionFrame({ ...input, signal }, frame);
      } catch (error) {
        if (signal.aborted) return false;
        releaseSampler();
        throw error;
      }
    },
  };
}
