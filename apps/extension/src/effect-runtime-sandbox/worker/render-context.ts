import type { EffectRuntimeWorkerRequest } from '../../contracts/effect-runtime/types';
import type {
  EffectV1Document,
  EffectV1RuntimeInputName,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  normalizeClips,
  normalizeLayers,
  normalizeScenes,
  normalizeTimeline,
  resolveScene,
} from './model/render-normalization';
import {
  isLayerActive,
  resolveLayerState,
  resolvePhaseProgress,
  resolveTrackValue,
} from './model/render-resolver';
import type { EffectRuntimeRenderContext, RuntimeCanvas } from './model/types';

export interface EffectRuntimePreparedRenderModel {
  clips: ReturnType<typeof normalizeClips>;
  layers: ReturnType<typeof normalizeLayers>;
  scenes: ReturnType<typeof normalizeScenes>;
  timeline: ReturnType<typeof normalizeTimeline>;
}

export function prepareEffectRuntimeRenderModel(
  document: EffectV1Document
): EffectRuntimePreparedRenderModel {
  const scenes = normalizeScenes(document.scenes, document.duration);
  return {
    clips: normalizeClips(document.clips, document.duration),
    layers: normalizeLayers(document.layers),
    scenes,
    timeline: normalizeTimeline(document.timeline, document.duration, scenes),
  };
}

export function createEffectRuntimeRenderContext(
  request: EffectRuntimeWorkerRequest,
  createCanvas: (width: number, height: number) => RuntimeCanvas,
  preparedModel: EffectRuntimePreparedRenderModel = prepareEffectRuntimeRenderModel(
    request.document
  )
): EffectRuntimeRenderContext {
  const { document } = request;
  const { clips, layers, scenes, timeline } = preparedModel;
  const scene = resolveScene(request.time, scenes);
  const inputFrames = collectInputBitmaps(request);
  const sceneProgress = resolveSceneProgress(request.time, scene.start, scene.duration);
  const resolvers = createRenderResolvers(request, layers, clips, scenes, timeline);
  return {
    assets: request.assets,
    clips,
    controls: request.controls,
    createCanvas,
    duration: request.duration,
    durationInFrames: Math.round(request.duration * request.fps),
    effectId: document.id,
    fps: request.fps,
    frame: request.frameIndex,
    frameIndex: request.frameIndex,
    height: request.height,
    inputFrames,
    kind: document.kind === 'standalone' ? 'composition' : 'effect',
    layers,
    progress: request.progress,
    scene,
    sceneProgress,
    scenes,
    sceneTime: Math.max(0, request.time - scene.start),
    time: request.time,
    timeline,
    width: request.width,
    ...resolvers,
  };
}

function createRenderResolvers(
  request: EffectRuntimeWorkerRequest,
  layers: ReturnType<typeof normalizeLayers>,
  clips: ReturnType<typeof normalizeClips>,
  scenes: ReturnType<typeof normalizeScenes>,
  timeline: ReturnType<typeof normalizeTimeline>
) {
  return {
    isLayerActive: (layerId: string, at = request.time) =>
      isLayerActive(clips, layerId, at, scenes),
    phaseProgress: (phaseId: string, at = request.time) =>
      resolvePhaseProgress(timeline, phaseId, at),
    resolveLayer: (layerId: string, at = request.time) =>
      resolveLayerState(layers, clips, timeline, layerId, at),
    resolveTrack: (trackId: string, fallback: unknown, at = request.time) =>
      resolveTrackValue(timeline, trackId, at, fallback),
    track: (trackId: string, fallback: unknown, at = request.time) =>
      resolveTrackValue(timeline, trackId, at, fallback),
  };
}

function collectInputBitmaps(
  request: EffectRuntimeWorkerRequest
): Partial<Record<EffectV1RuntimeInputName, ImageBitmap>> {
  const inputFrames: Partial<Record<EffectV1RuntimeInputName, ImageBitmap>> = {};
  for (const name of ['source', 'from', 'to'] as const) {
    const frame = request.inputFrames[name];
    if (frame) inputFrames[name] = frame.bitmap;
  }
  return inputFrames;
}

function resolveSceneProgress(time: number, start: number, duration: number): number {
  return duration > 0 ? Math.min(1, Math.max(0, (time - start) / duration)) : 0;
}
