import { shouldLockVisualLayerToViewport } from '../../motion/layer-camera';
import { drawSceneBackground, getProjectSceneBackground } from '../../../project/scene/background';
import { resolveSceneBackgroundAudioEnvelope } from '../../../project/scene/background-audio';
import type { VideoProject } from '../../../project/types';
import type { ReviewSpatialRenderer } from '../../canvas/spatial-renderer';
import {
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  closeEffectRuntimeBitmap,
} from '../runtime/resource-limits';
// policyStateIds: [] - empty render maps are immutable sentinels, not authority state.
import type { EffectRuntimeSandboxExecutor } from '../../../../../contracts/effect-runtime/types';
import type { VideoCompositionMediaSource } from '../../draw/media-source';
import type { VideoCompositionFrame, VideoCompositionVisualPass } from '../../types';
import { renderEffectRuntimeFramePlans } from '../runtime/driver';
import { createEffectRuntimeInputMaterializer } from '../frame/inputs';
import { disposeEffectRuntimeComposition } from './rendered';
import { createEffectRuntimeCompositionResourceLedger } from '../runtime/resource-limits';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedFrame,
  EffectRuntimeRenderedComposition,
  EffectRuntimeRenderedFrameMap,
} from '../runtime/types';

const EMPTY_EFFECT_RUNTIME_FRAMES: EffectRuntimeRenderedFrameMap = new Map();

export async function renderEffectRuntimeComposition(args: {
  project?: VideoProject;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  executor: EffectRuntimeSandboxExecutor;
  imageBank: Record<string, HTMLImageElement>;
  overlayFrame: VideoCompositionFrame;
  overlayTime: number;
  ownerDocument?: Document;
  spatialRenderer?: () => ReviewSpatialRenderer;
  rasterScale?: number;
  signal?: AbortSignal;
  streamVisualPasses?: boolean;
  visualPasses: readonly VideoCompositionVisualPass[];
}): Promise<EffectRuntimeRenderedComposition> {
  const renderedByTime = new Map<number, EffectRuntimeRenderedFrameMap>();
  const resourceLedger = createEffectRuntimeCompositionResourceLedger();
  let disposed = false;
  let preparing = false;
  let sampledTime: number | undefined;
  const releaseSampled = () => {
    if (sampledTime === undefined) return;
    const frames = renderedByTime.get(sampledTime);
    if (frames) for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
    renderedByTime.delete(sampledTime);
    sampledTime = undefined;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    disposeEffectRuntimeComposition({
      framesByTime: renderedByTime,
      overlayFrames: EMPTY_EFFECT_RUNTIME_FRAMES,
    });
    renderedByTime.clear();
  };
  const prepareVisualPass = async (time: number) => {
    if (disposed) throw new Error('EFFECT_RUNTIME_COMPOSITION_DISPOSED');
    if (preparing) throw new Error('EFFECT_RUNTIME_COMPOSITION_BUSY');
    if (time === args.overlayTime) {
      releaseSampled();
      return;
    }
    if (time === sampledTime) return;
    const pass = args.visualPasses.find((pass) => pass.time === time);
    if (!pass) throw new Error('EFFECT_RUNTIME_VISUAL_PASS_MISSING');
    releaseSampled();
    preparing = true;
    try {
      const frames = await renderFrame(pass.frame, time, true);
      if (disposed) {
        for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
        throw new Error('EFFECT_RUNTIME_COMPOSITION_DISPOSED');
      }
      renderedByTime.set(time, frames);
      sampledTime = time;
    } catch (error) {
      dispose();
      throw error;
    } finally {
      preparing = false;
    }
  };
  try {
    const overlayFrames = await renderFrame(args.overlayFrame, args.overlayTime);
    renderedByTime.set(args.overlayTime, overlayFrames);
    if (args.streamVisualPasses)
      return { framesByTime: renderedByTime, overlayFrames, prepareVisualPass, dispose };
    for (const pass of args.visualPasses) {
      if (renderedByTime.has(pass.time)) continue;
      renderedByTime.set(pass.time, await renderFrame(pass.frame, pass.time, true));
    }
    return { framesByTime: renderedByTime, overlayFrames };
  } catch (error) {
    disposeEffectRuntimeComposition({
      framesByTime: renderedByTime,
      overlayFrames: EMPTY_EFFECT_RUNTIME_FRAMES,
    });
    throw error;
  }

  async function renderFrame(
    frame: VideoCompositionFrame,
    time: number,
    sampled = false
  ): Promise<EffectRuntimeRenderedFrameMap> {
    args.signal?.throwIfAborted();
    const selected = sampled
      ? selectExposurePlans(frame, args.overlayFrame)
      : (frame.effectRuntimePlans ?? []);
    if (selected.length === 0) {
      return Promise.resolve(EMPTY_EFFECT_RUNTIME_FRAMES);
    }
    if (frame.sceneSpotlights?.some((state) => state.afterClipId) && !args.project)
      throw new Error('EFFECT_RUNTIME_SOURCE_SCENE_CONTEXT_MISSING');
    const resourceScope = resourceLedger.createFrameScope();
    const plans = orderBackdropTrackPlans(
      selected.map((plan) => scaleEffectRuntimeFramePlan(plan, args.rasterScale)),
      frame
    );
    const frames = await renderEffectRuntimeFramePlans({
      executor: args.executor,
      inputMaterializer: createEffectRuntimeInputMaterializer({
        camera: frame.camera,
        ...(args.project ? { scene: { project: args.project, frame } } : {}),
        drawBackground: (context, dimensions) => {
          const project = args.project;
          if (!project) throw new Error('EFFECT_RUNTIME_SOURCE_SCENE_CONTEXT_MISSING');
          drawSceneBackground({
            context,
            ...dimensions,
            currentTime: time,
            projectScale: dimensions.width / project.width,
            audioEnvelope: resolveSceneBackgroundAudioEnvelope(project, time),
            sceneBackground: getProjectSceneBackground(project),
            loadedImages: args.imageBank,
            ...(frame.camera.backgroundCamera ? { camera: frame.camera.backgroundCamera } : {}),
          });
        },
        ...(args.spatialRenderer ? { spatialRenderer: args.spatialRenderer } : {}),
        clipMediaElements: args.clipMediaElements,
        imageBank: args.imageBank,
        ...(args.ownerDocument ? { ownerDocument: args.ownerDocument } : {}),
        visualLayers: frame.effectInputLayers,
        resourceScope,
      }),
      plans,
      resourceScope,
      ...(args.signal ? { signal: args.signal } : {}),
    });
    return releaseConsumedEffectOutputs(frames);
  }
}

/** Dependencies stay alive until every reader finishes; only final draw rasters cross exposure times. */
function releaseConsumedEffectOutputs(
  frames: EffectRuntimeRenderedFrameMap
): EffectRuntimeRenderedFrameMap {
  const clipTargets = new Set<string>();
  const groupedClips = new Set<string>();
  const videoGroupClips = new Set<string>();
  for (const frame of frames.values()) {
    if (frame.target.kind === 'clip') clipTargets.add(frame.target.clipId);
    if (frame.target.kind === 'track' || frame.target.kind === 'video-group') {
      for (const id of frame.target.clipIds) {
        groupedClips.add(id);
        if (frame.target.kind === 'video-group') videoGroupClips.add(id);
      }
    }
  }
  let retained: Map<string, EffectRuntimeRenderedFrame> | undefined;
  for (const [id, frame] of frames) {
    const target = frame.target;
    const covered =
      target.kind === 'scene'
        ? clipTargets.has(target.clipId) || groupedClips.has(target.clipId)
        : target.kind === 'clip'
          ? groupedClips.has(target.clipId)
          : target.kind === 'track' &&
            target.clipIds.every((clipId) => videoGroupClips.has(clipId));
    if (covered) {
      retained ??= new Map(frames);
      retained.delete(id);
      closeEffectRuntimeBitmap(frame.bitmap);
    }
  }
  return retained ?? frames;
}

/** Locked standalone layers draw once from the overlay; sampled dependencies still need their own clock. */
function selectExposurePlans(
  frame: VideoCompositionFrame,
  overlay: VideoCompositionFrame
): readonly EffectRuntimeFramePlan[] {
  const plans = frame.effectRuntimePlans ?? [];
  if (frame.sceneSpotlights?.some((state) => state.afterClipId)) return plans;
  const locked = new Set(
    overlay.visualLayers
      .filter((layer) => shouldLockVisualLayerToViewport(layer, overlay.camera))
      .map((layer) => layer.clipId)
  );
  const inputs = new Set(
    plans.flatMap((plan) => {
      const target = plan.target;
      switch (target.kind) {
        case 'scene':
          return [];
        case 'clip':
          return [target.clipId];
        case 'transition':
          return [target.leadingClipId, target.trailingClipId];
        case 'track':
        case 'video-group':
          return target.clipIds;
      }
    })
  );
  return plans.filter(
    (plan) =>
      plan.kind !== 'standalone' ||
      plan.target.kind !== 'scene' ||
      !locked.has(plan.target.clipId) ||
      inputs.has(plan.target.clipId)
  );
}

/** Backdrop readers depend on lower track results; each FX chain retains its authored order. */
function orderBackdropTrackPlans(plans: EffectRuntimeFramePlan[], frame: VideoCompositionFrame) {
  if (
    !frame.sceneSpotlights?.some(
      (state) =>
        state.afterClipId && (state.spotlight.effect === 'blur' || state.from?.effect === 'blur')
    )
  )
    return plans;
  const positions = new Map(frame.visualLayers.map((layer, index) => [layer.clipId, index]));
  const rank = (plan: EffectRuntimeFramePlan) =>
    plan.target.kind === 'track'
      ? Math.min(...plan.target.clipIds.map((id) => positions.get(id) ?? Number.MAX_SAFE_INTEGER))
      : Number.MAX_SAFE_INTEGER;
  const tracks = plans
    .filter((plan) => plan.target.kind === 'track')
    .toSorted((left, right) => rank(left) - rank(right));
  let nextTrack = 0;
  return plans.map((plan) => (plan.target.kind === 'track' ? tracks[nextTrack++]! : plan));
}

function scaleEffectRuntimeFramePlan(
  plan: EffectRuntimeFramePlan,
  rasterScale: number | undefined
): EffectRuntimeFramePlan {
  const scale = Math.min(
    Math.max(0.01, rasterScale ?? 1),
    Math.sqrt(
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels /
        (plan.dimensions.width * plan.dimensions.height)
    )
  );
  if (
    scale === 1 &&
    plan.renderDimensions.width === plan.dimensions.width &&
    plan.renderDimensions.height === plan.dimensions.height
  )
    return plan;
  return {
    ...plan,
    renderDimensions: {
      height: Math.max(1, Math.floor(plan.dimensions.height * scale)),
      width: Math.max(1, Math.floor(plan.dimensions.width * scale)),
    },
  };
}
