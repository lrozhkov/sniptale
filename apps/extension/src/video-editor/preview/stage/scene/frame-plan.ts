import { capturePreviewImageResources, arePreviewImageResourcesReady } from './image-resources';
import type { EffectRuntimeFramePlan } from '../../../../features/video/composition/effect-runtime/runtime/types';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import { scaleEffectRuntimeFramePlan } from '../../../../features/video/composition/effect-runtime/render/wave';
import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import {
  canPrepareEffectRuntimeGpuComposition,
  prepareEffectRuntimeGpuComposition,
} from '../../../../features/video/composition/effect-runtime/render/gpu-wave';
import {
  isVideoCompositionFrameSource,
  type VideoCompositionFrameSource,
  type VideoCompositionMediaSource,
} from '../../../../features/video/composition/draw/media-source';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import {
  resolvePreviewEffectRuntimeRasterScale,
  resolvePreviewCompositionFrameSize,
} from './canvas';
import type { PreviewSceneRenderInput, PreviewScenePreparedFrame } from './types';

type Passes = ReturnType<typeof resolveVideoCompositionRenderPasses>;

/** Own captured sources independently of the moving media elements and their callers. */
export function captureNativePreviewSources(input: PreviewSceneRenderInput, passes: Passes) {
  const frames = new Map<string, VideoFrame>();
  const media = new Map<string, VideoCompositionMediaSource>();
  for (const [id, source] of Object.entries(input.videoRefs.current))
    if (source) media.set(id, source);
  for (const [id, source] of input.decodedVideoFrames ?? []) media.set(id, source);
  const release = () => {
    for (const frame of frames.values()) frame.close();
    frames.clear();
  };
  try {
    const needed = new Set(
      [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)].flatMap((frame) =>
        [...frame.visualLayers, ...frame.effectInputLayers]
          .filter((layer) => layer.kind === 'video')
          .map((layer) => layer.clipId)
      )
    );
    for (const id of needed) {
      const source = media.get(id);
      if (source instanceof HTMLVideoElement) {
        if (source.seeking || source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          release();
          return null;
        }
        frames.set(id, new VideoFrame(source));
      } else if (isVideoCompositionFrameSource(source) && source.toVideoFrame)
        frames.set(id, source.toVideoFrame());
      else throw new Error('GPU decoded source frame is unavailable.');
    }
    return { frames, media, release };
  } catch (error) {
    release();
    throw error;
  }
}

/** Assemble the same standalone effect request for serial and reserved frames. */
export function prepareNativePreviewGpuComposition(
  input: PreviewSceneRenderInput,
  passes: Passes,
  executor: EffectRuntimeSandboxExecutor,
  rasterScale = resolvePreviewEffectRuntimeRasterScale({
    canvas: input.canvas,
    ...(input.previewRasterSize ? { previewRasterSize: input.previewRasterSize } : {}),
    project: input.project,
    stage: input.stage,
  })
) {
  return prepareEffectRuntimeGpuComposition({
    executor,
    overlayFrame: passes.overlayFrame,
    overlayTime: input.currentTime,
    visualPasses: passes.visualPasses,
    rasterScale,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

/** Prepare CPU-side scene work without acquiring an output or changing GPU materials. */
export function prepareNativePreviewSceneFrame(
  input: PreviewSceneRenderInput
): Promise<PreviewScenePreparedFrame | undefined> | undefined {
  if (input.previewRenderer === 'legacy' || typeof VideoFrame === 'undefined') return undefined;
  input.signal?.throwIfAborted();
  const passes = resolveVideoCompositionRenderPasses(input.project, input.currentTime);
  if (input.cameraOverride) {
    passes.overlayFrame.camera = input.cameraOverride;
    for (const pass of passes.visualPasses) pass.frame.camera = input.cameraOverride;
  }
  const frames = [passes.overlayFrame, ...passes.visualPasses.map((pass) => pass.frame)];
  if (!canPrepareEffectRuntimeGpuComposition(frames)) return undefined;
  const hasPlans = frames.some((frame) => (frame.effectRuntimePlans ?? []).length > 0);
  const executor = hasPlans
    ? typeof input.effectRuntimeExecutor === 'function'
      ? input.effectRuntimeExecutor()
      : input.effectRuntimeExecutor
    : undefined;
  if (hasPlans && !executor?.prepareGpuFrame) return undefined;
  const rasterScale = resolvePreviewEffectRuntimeRasterScale({
    canvas: input.canvas,
    ...(input.previewRasterSize ? { previewRasterSize: input.previewRasterSize } : {}),
    project: input.project,
    stage: input.stage,
  });
  const captured = captureNativePreviewSources(input, passes);
  if (!captured) return undefined;
  return (async () => {
    let effects: Awaited<ReturnType<typeof prepareNativePreviewGpuComposition>> | undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try {
        effects?.dispose();
      } finally {
        captured.release();
      }
    };
    try {
      const media = new Map<string, VideoCompositionFrameSource>();
      const sourcePresentation = new Map<
        string,
        { timestampUs: number; durationUs: number | null }
      >();
      for (const [id, frame] of captured.frames) {
        const original = captured.media.get(id);
        const decoded = isVideoCompositionFrameSource(original) ? original : undefined;
        sourcePresentation.set(id, { timestampUs: frame.timestamp, durationUs: frame.duration });
        media.set(id, {
          sourceWidth: decoded?.sourceWidth ?? frame.displayWidth,
          sourceHeight: decoded?.sourceHeight ?? frame.displayHeight,
          ...(decoded?.orientation ? { orientation: decoded.orientation } : {}),
          toVideoFrame: () => frame.clone(),
          draw: (context, x, y, width, height) => context.drawImage(frame, x, y, width, height),
        });
      }
      await input.prepareImages?.(frames, input.signal);
      input.signal?.throwIfAborted();
      const imageResources = capturePreviewImageResources(input, passes);
      input.onImageResourcesPrepared?.(imageResources);
      if (!arePreviewImageResourcesReady(imageResources)) {
        release();
        return undefined;
      }
      if (executor)
        effects = await prepareNativePreviewGpuComposition(input, passes, executor, rasterScale);
      input.signal?.throwIfAborted();
      return {
        input: {
          ...input,
          imageBank: imageResources.images,
          decodedVideoFrames: media,
          preparedFrame: {
            passes,
            imageResources,
            ...(effects ? { effects } : {}),
            rasterScale,
            compositionTime: input.currentTime,
            sourcePresentation,
          },
        },
        release,
      };
    } catch (error) {
      release();
      throw error;
    }
  })();
}

interface UpcomingNativeEffectOnset {
  clipId: string;
  effectInstanceId: string;
  onset: number;
  time: number;
}

/** Select eligibility and one positive tick before resolving future composition geometry. */
export function resolveUpcomingNativeEffectOnset(
  project: PreviewSceneRenderInput['project'],
  currentTime: number
): UpcomingNativeEffectOnset | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(project.fps) || project.fps <= 0)
    return null;
  const hosts = project.clips
    .filter(
      (clip) =>
        clip.type === 'EFFECT' &&
        clip.startTime > currentTime &&
        clip.startTime <= currentTime + 1 &&
        clip.duration > 0 &&
        project.tracks.some((track) => track.id === clip.trackId && track.visible) &&
        project.effectInstances?.some(
          (instance) =>
            instance.id === clip.effectInstanceId &&
            instance.kind === 'standalone' &&
            instance.enabled
        )
    )
    .sort((a, b) => a.startTime - b.startTime);
  const host = hosts[0];
  if (!host || host.type !== 'EFFECT') return null;
  const first = Math.ceil(host.startTime * project.fps) / project.fps;
  const end = host.startTime + host.duration;
  const time = first + 1 / project.fps < end ? first + 1 / project.fps : first;
  return time < end
    ? { clipId: host.id, effectInstanceId: host.effectInstanceId, onset: host.startTime, time }
    : null;
}

/** Resolve one future standalone request from project data without capturing or seeking media. */
export function resolveUpcomingNativeEffect(
  input: Pick<
    PreviewSceneRenderInput,
    'project' | 'currentTime' | 'canvas' | 'stage' | 'previewRasterSize'
  >
): {
  onset: number;
  time: number;
  plan: EffectRuntimeFramePlan;
  layer: VideoCompositionVisualLayer;
  fullFrame: false;
  logical: { width: number; height: number };
  output: { width: number; height: number };
} | null {
  const { project, currentTime } = input;
  const next = resolveUpcomingNativeEffectOnset(project, currentTime);
  if (!next) return null;
  const passes = resolveVideoCompositionRenderPasses(project, next.time);
  const plan = passes.overlayFrame.effectRuntimePlans?.find(
    (plan) =>
      plan.effectInstanceId === next.effectInstanceId &&
      plan.kind === 'standalone' &&
      plan.target.kind === 'scene' &&
      plan.target.clipId === next.clipId
  );
  const layer = passes.overlayFrame.visualLayers.find(
    (layer) => layer.clipId === next.clipId && layer.kind === 'effect'
  );
  if (!plan || !layer) return null;
  const logical = { width: project.width, height: project.height };
  return {
    onset: next.onset,
    time: next.time,
    fullFrame: false,
    layer,
    logical,
    output: resolvePreviewCompositionFrameSize(input) ?? logical,
    plan: scaleEffectRuntimeFramePlan(plan, resolvePreviewEffectRuntimeRasterScale(input)),
  };
}
