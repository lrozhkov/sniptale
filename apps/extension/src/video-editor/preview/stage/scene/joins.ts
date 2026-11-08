import type { GpuPreviewOutput } from '../../../../features/video/composition/canvas/preview-presentation';
import { isClipActiveAtTime } from '../../../../features/video/project/timeline/basics';
import {
  resolveVideoProjectCompositionJoinPlans,
  resolveActiveVideoProjectCompositionJoinPlan,
} from '../../../../features/video/project/scene/joins';
import type { VideoProject } from '../../../../features/video/project/types/model';
import {
  createVideoPreviewFrameMaterializer,
  type VideoPreviewFrameMaterializer,
} from '../../cache/materializer';
import { resolvePreviewCompositionFrameSize, publishPreviewCompositionFrame } from './canvas';
import type { renderPreviewScene } from './render-preview';
import type { PreviewScenePreparedFrame } from './types';

type Input = Parameters<typeof renderPreviewScene>[0];
/** Reuses the existing renderer for composition joins and bounded content clocks. */
export function createVideoPreviewCompositionJoinRenderer(
  renderCurrent: typeof renderPreviewScene,
  prepareCurrent?: (input: Input) => Promise<PreviewScenePreparedFrame | undefined> | undefined
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
  const usesMaterializedScene = (input: Input) => {
    if (projection?.project !== input.project) {
      projection = {
        project: input.project,
        plans: resolveVideoProjectCompositionJoinPlans(input.project),
      };
    }
    return (
      !!resolveActiveVideoProjectCompositionJoinPlan(projection.plans, input.currentTime) ||
      input.project.clips.some(
        (clip) =>
          clip.type === 'VIDEO' &&
          clip.playbackWindow &&
          isClipActiveAtTime(clip, input.currentTime)
      )
    );
  };
  return {
    clear,
    prepare(input: Input) {
      input.signal?.throwIfAborted();
      if (disposed) throw new Error('Preview composition owner is disposed.');
      return usesMaterializedScene(input) ? undefined : prepareCurrent?.(input);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
    async render(input: Input): ReturnType<typeof renderPreviewScene> {
      input.signal?.throwIfAborted();
      if (disposed) throw new Error('Preview composition owner is disposed.');
      if (!usesMaterializedScene(input)) {
        releaseSampler();
        return renderCurrent(input);
      }
      const rasterSize = resolvePreviewCompositionFrameSize(input);
      if (!rasterSize) return false;
      const assetUrls = input.assetUrls ?? {};
      const key = JSON.stringify({
        rasterSize,
        assetUrls,
        renderer: input.previewRenderer ?? 'gpu',
      });
      if (
        !sampler ||
        sampler.document !== input.canvas.ownerDocument ||
        sampler.key !== key ||
        !sampler.materializer.updateProject(input.project)
      ) {
        releaseSampler();
        sampler = {
          document: input.canvas.ownerDocument,
          key,
          controller: new AbortController(),
          materializer: createVideoPreviewFrameMaterializer({
            previewRenderer: input.previewRenderer ?? 'gpu',
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
      let untransferredOutput: GpuPreviewOutput | undefined;
      try {
        const frame = await current.materializer.renderFrameWithPresentation(
          input.currentTime,
          signal,
          input.cameraOverride,
          input.acquireGpuOutput,
          input.effectPreparation
        );
        untransferredOutput = frame.presentation.output;
        signal.throwIfAborted();
        if (untransferredOutput) {
          untransferredOutput = undefined;
          return frame.presentation;
        }
        const published = publishPreviewCompositionFrame({ ...input, signal }, frame.canvas);
        return published === false ? false : frame.presentation;
      } catch (error) {
        if (signal.aborted) return false;
        releaseSampler();
        throw error;
      } finally {
        untransferredOutput?.release();
      }
    },
  };
}
