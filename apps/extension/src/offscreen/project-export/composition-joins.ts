import { createCompositionCutSampleSource } from '../../workflows/video-review/decoded-video-sample';
import { createCompositionJoinEndpoints } from '../../features/video/composition/canvas/join-endpoints';
import {
  drawCompositionColorOverlay,
  drawVideoProjectSceneEdges,
} from '../../features/video/composition/canvas/scene-edges';
import { evaluateCompositionJoin } from '../../features/video/project/scene/composition-join';
import {
  resolveActiveVideoProjectCompositionJoinPlan,
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
import type { ExportJobState, ProjectExportCompositionJoinRenderer } from './types';

type Input = ProjectCompositionSceneInput & {
  job: ProjectCompositionSceneInput['job'] &
    Pick<ExportJobState, 'compositionJoinRenderer' | 'clipMediaElements'>;
};

export type { ProjectExportCompositionJoinRenderer } from './types';

/** Applies final composition joins and outer fades after the caller synchronizes its ordinary media. */
export async function renderProjectCompositionFrame(args: Input): Promise<void> {
  if (args.job.cancelled || args.signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  const plans = resolveVideoProjectCompositionJoinPlans(args.project);
  const plan = resolveActiveVideoProjectCompositionJoinPlan(plans, args.currentTime);
  const windowed = args.project.clips.some(
    (clip) =>
      clip.type === 'VIDEO' && clip.playbackWindow && isClipActiveAtTime(clip, args.currentTime)
  );
  if (!plan && !windowed) {
    args.job.compositionJoinRenderer?.clear();
    await renderProjectCompositionScene(args);
  } else if (
    !windowed &&
    plan?.boundary.transition?.type === 'fade-black' &&
    plan.boundary.sampling !== 'cut' &&
    !resolveActiveVideoProjectCompositionJoinPlan(
      plans.filter(({ boundary }) => boundary.sampling === 'cut'),
      args.currentTime
    )
  ) {
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
  drawVideoProjectSceneEdges(
    args.context,
    args.project,
    args.currentTime,
    undefined,
    args.settings.fps
  );
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
  let cutPlan: VideoProjectCompositionJoinPlan | undefined;
  const cutPlans = resolveVideoProjectCompositionJoinPlans(args.project).filter(
    ({ boundary }) => boundary.sampling === 'cut'
  );
  let nestedCuts: ProjectExportCompositionJoinRenderer | undefined;
  let cutSampler: ReturnType<typeof createCompositionCutSampleSource> | undefined;
  const renderSample = async (time: number, signal: AbortSignal) => {
    const nested = cutPlan
      ? undefined
      : resolveActiveVideoProjectCompositionJoinPlan(cutPlans, time);
    const bounded =
      cutPlan ||
      args.project.clips.some(
        (clip) => clip.type === 'VIDEO' && clip.playbackWindow && isClipActiveAtTime(clip, time)
      );
    if (!bounded && !nested)
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
    if (!bounded && !nested)
      await syncVideoClipFrame({ clipMediaElements: videos }, args.project, time, signal);
    signal.throwIfAborted();
    if (bounded)
      cutSampler ??= createCompositionCutSampleSource({
        project: args.project,
        sourceUrl: (clip) => {
          const source = args.job.clipMediaElements.get(clip.id);
          return source?.currentSrc || source?.src;
        },
      });
    const frames = bounded
      ? await cutSampler!.sample(time, signal, !cutPlan || time < cutPlan.seam ? 'last' : 'first')
      : undefined;
    let sample: ReturnType<typeof resources.canvas> | undefined;
    try {
      sample = resources.canvas('export-composition-sample', size);
      if (nested) {
        nestedCuts ??= createProjectExportCompositionJoinRenderer(args);
        await nestedCuts.draw(sample.context, nested, time, signal);
      } else
        await renderProjectCompositionScene({
          ...args,
          context: sample.context,
          currentTime: time,
          captionSampleTime: time,
          clipMediaElements: frames?.media ?? videos,
          ownerDocument,
          effectRuntime,
          signal,
        });
      signal.throwIfAborted();
      return sample;
    } catch (error) {
      sample?.release();
      throw error;
    } finally {
      frames?.release();
    }
  };
  const endpoints = createCompositionJoinEndpoints({ resources, size, renderSample });
  return {
    project: args.project,
    settings: args.settings,
    clear() {
      endpoints.clear();
      nestedCuts?.clear();
      cutSampler?.dispose();
      cutSampler = undefined;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      endpoints.dispose();
      nestedCuts?.dispose();
      cutSampler?.dispose();
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
      const samplingSignal = AbortSignal.any([signal, controller.signal]);
      samplingSignal.throwIfAborted();
      cutPlan = plan?.boundary.sampling === 'cut' ? plan : undefined;
      if (cutPlan) {
        nestedCuts?.dispose();
        nestedCuts = undefined;
      }
      if (
        !cutPlan &&
        !args.project.clips.some(
          (clip) => clip.type === 'VIDEO' && clip.playbackWindow && isClipActiveAtTime(clip, time)
        )
      ) {
        cutSampler?.dispose();
        cutSampler = undefined;
      }
      if (!plan || plan.boundary.transition?.type === 'fade-black') {
        const sample = await renderSample(time, samplingSignal);
        try {
          context.clearRect(0, 0, size.width, size.height);
          context.drawImage(sample.canvas, 0, 0);
          if (plan) {
            const blend = evaluateCompositionJoin(time, plan.seam, plan.before, plan.after)!;
            drawCompositionColorOverlay(
              context,
              blend.black,
              plan.boundary.transition?.color ?? '#000000'
            );
          }
        } finally {
          sample.release();
        }
        return;
      }
      const samples = resolveVideoProjectCompositionJoinEndpoints(plan, args.settings.fps, time);
      const blend = evaluateCompositionJoin(time, plan.seam, plan.before, plan.after)!;
      await endpoints.draw(
        context,
        {
          key: plan.boundary,
          ...(cutPlan ? { sampling: 'cut' as const } : {}),
          ...samples,
          incomingWeight: blend.incoming,
        },
        samplingSignal
      );
    },
  };
}
