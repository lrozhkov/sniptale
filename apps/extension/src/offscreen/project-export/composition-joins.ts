import { createCompositionJoinEndpoints } from '../../features/video/composition/canvas/join-endpoints';
import {
  drawCompositionColorOverlay,
  drawVideoProjectSceneEdges,
} from '../../features/video/composition/canvas/scene-edges';
import { evaluateCompositionJoin } from '../../features/video/project/scene/composition-join';
import {
  resolveVideoProjectCompositionJoinEndpoints,
  resolveVideoProjectCompositionJoinPlans,
} from '../../features/video/project/scene/joins';
import type { VideoProjectCompositionJoinPlan } from '../../features/video/project/scene/joins-types';
import { isClipActiveAtTime } from '../../features/video/project/timeline/basics';
import { createPreviewRenderResources } from '../../workflows/video-review/preview-render-resources';
import {
  renderProjectCompositionScene,
  type ProjectCompositionSceneInput,
} from './composition-scene';
import { createOffscreenProjectEffectRuntime } from './effect-runtime';
import { syncVideoClipFrame } from './media-playback/frame';
import { waitForMediaElementReady } from './media-loading/ready';
import type { ExportJobState } from './types';

type Input = ProjectCompositionSceneInput & {
  job: ProjectCompositionSceneInput['job'] &
    Pick<ExportJobState, 'compositionJoinRenderer' | 'clipMediaElements'>;
};

/** The existing job owns the immutable endpoints and borrowed-URL paused decoders. */
export interface ProjectExportCompositionJoinRenderer {
  project: Input['project'];
  settings: Input['settings'];
  clear(): void;
  dispose(): void;
  draw(
    context: CanvasRenderingContext2D,
    plan: VideoProjectCompositionJoinPlan,
    time: number,
    signal: AbortSignal
  ): Promise<void>;
}

/** Applies final composition joins and outer fades after the caller synchronizes its ordinary media. */
export async function renderProjectCompositionFrame(args: Input): Promise<void> {
  if (args.job.cancelled || args.signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  const plan = resolveVideoProjectCompositionJoinPlans(args.project).find((item) =>
    evaluateCompositionJoin(args.currentTime, item.seam, item.before, item.after)
  );
  if (!plan) {
    args.job.compositionJoinRenderer?.clear();
    await renderProjectCompositionScene(args);
  } else if (plan.boundary.transition?.type === 'fade-black') {
    args.job.compositionJoinRenderer?.clear();
    await renderProjectCompositionScene(args);
    const blend = evaluateCompositionJoin(args.currentTime, plan.seam, plan.before, plan.after)!;
    drawCompositionColorOverlay(
      args.context,
      blend.black,
      plan.boundary.transition.color ?? '#000000'
    );
  } else {
    let renderer = args.job.compositionJoinRenderer;
    if (renderer && (renderer.project !== args.project || renderer.settings !== args.settings)) {
      renderer.dispose();
      delete args.job.compositionJoinRenderer;
      renderer = undefined;
    }
    renderer ??= createProjectExportCompositionJoinRenderer(args);
    args.job.compositionJoinRenderer = renderer;
    try {
      await renderer.draw(
        args.context,
        plan,
        args.currentTime,
        args.signal ?? new AbortController().signal
      );
    } catch (error) {
      renderer.dispose();
      if (args.job.compositionJoinRenderer === renderer) delete args.job.compositionJoinRenderer;
      throw error;
    }
  }
  if (args.job.cancelled || args.signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  drawVideoProjectSceneEdges(args.context, args.project, args.currentTime);
}

function createProjectExportCompositionJoinRenderer(
  args: Input
): ProjectExportCompositionJoinRenderer {
  const ownerDocument = args.ownerDocument ?? args.context.canvas.ownerDocument;
  const size = { width: args.settings.width, height: args.settings.height };
  const resources = createPreviewRenderResources({
    maximumCanvases: 3,
    maximumManagedBytes: size.width * size.height * 12,
    createCanvas: () => ownerDocument.createElement('canvas'),
  });
  const controller = new AbortController();
  const videos = new Map<string, HTMLMediaElement>();
  const effectRuntime = createOffscreenProjectEffectRuntime({ ownerDocument });
  let disposed = false;
  const endpoints = createCompositionJoinEndpoints({
    resources,
    size,
    async renderSample(time, signal) {
      for (const clip of args.project.clips) {
        signal.throwIfAborted();
        if (clip.type !== 'VIDEO' || !isClipActiveAtTime(clip, time)) continue;
        let video = videos.get(clip.id);
        if (!video) {
          const source = args.job.clipMediaElements.get(clip.id);
          const url = source?.currentSrc || source?.src;
          if (!url) throw new Error('Composition sample media is unavailable.');
          const created = ownerDocument.createElement('video');
          created.preload = 'auto';
          created.muted = true;
          created.playsInline = true;
          created.crossOrigin = 'anonymous';
          created.src = url;
          video = created;
          videos.set(clip.id, video);
          video.load();
        }
        await waitForMediaElementReady(video, { signal });
        signal.throwIfAborted();
      }
      await syncVideoClipFrame({ clipMediaElements: videos }, args.project, time, signal);
      signal.throwIfAborted();
      const sample = resources.canvas('export-composition-sample', size);
      try {
        await renderProjectCompositionScene({
          ...args,
          context: sample.context,
          currentTime: time,
          captionSampleTime: time,
          clipMediaElements: videos,
          ownerDocument,
          effectRuntime,
          signal,
        });
        signal.throwIfAborted();
        return sample;
      } catch (error) {
        sample.release();
        throw error;
      }
    },
  });
  return {
    project: args.project,
    settings: args.settings,
    clear: endpoints.clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      endpoints.dispose();
      effectRuntime.dispose();
      resources.dispose();
      for (const video of videos.values()) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
      }
      videos.clear();
    },
    async draw(context, plan, time, signal) {
      if (disposed) throw new Error('Composition export sampler is disposed.');
      const samples = resolveVideoProjectCompositionJoinEndpoints(plan, args.settings.fps);
      const blend = evaluateCompositionJoin(time, plan.seam, plan.before, plan.after)!;
      await endpoints.draw(
        context,
        { key: plan.boundary, ...samples, incomingWeight: blend.incoming },
        AbortSignal.any([signal, controller.signal])
      );
    },
  };
}
