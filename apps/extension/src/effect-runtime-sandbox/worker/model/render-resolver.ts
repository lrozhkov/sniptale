import { interpolateTimelineValue, resolveTimelineEase, segment } from '../math.js';
import { sampleRuntimeMotionPathTrackValue } from '../timeline/render-motion-path.js';
import {
  indexClips,
  indexLayers,
  indexTimeline,
  isPhaseEnabled,
  isSceneEnabled,
} from './render-index.js';
import type {
  NormalizedClip,
  NormalizedLayer,
  NormalizedScene,
  NormalizedTimeline,
  NormalizedTimelineKeyframe,
  ResolvedLayer,
} from './types.js';

export function isLayerActive(
  clips: NormalizedClip[],
  layerId: string,
  time: number,
  scenes: NormalizedScene[] = []
): boolean {
  const layerClips = indexClips(clips).get(layerId) ?? [];
  if (layerClips.length === 0) return true;
  return layerClips.some(
    (clip) =>
      clip.enabled &&
      isSceneEnabled(scenes, clip.sceneId) &&
      time >= clip.start &&
      time <= clip.start + clip.duration
  );
}

export function resolveLayerState(
  layers: NormalizedLayer[],
  clips: NormalizedClip[],
  timeline: NormalizedTimeline,
  layerId: string,
  time: number
): ResolvedLayer {
  const layer = indexLayers(layers).get(layerId) ?? fallbackLayer(layerId);
  const clip =
    (indexClips(clips).get(layerId) ?? []).find(
      (item) =>
        item.enabled &&
        isSceneEnabled(timeline.scenes, item.sceneId) &&
        time >= item.start &&
        time <= item.start + item.duration
    ) ?? null;
  return {
    ...layer,
    active: layer.visible && isLayerActive(clips, layerId, time, timeline.scenes),
    anchorX: resolveNumberTrack(timeline, `${layerId}.anchorX`, time, layer['anchorX'], 0),
    anchorY: resolveNumberTrack(timeline, `${layerId}.anchorY`, time, layer['anchorY'], 0),
    blur: resolveNumberTrack(timeline, `${layerId}.blur`, time, layer['blur'], 0),
    clip,
    clipProgress: clip ? segment(time, clip.start, clip.start + clip.duration) : 1,
    localTime: clip ? Math.max(0, time - clip.start + clip.offset) : time,
    opacity: resolveNumberTrack(timeline, `${layerId}.opacity`, time, layer.opacity, 1),
    rotation: resolveNumberTrack(timeline, `${layerId}.rotation`, time, layer['rotation'], 0),
    scaleX: resolveNumberTrack(timeline, `${layerId}.scaleX`, time, layer['scaleX'], 1),
    scaleY: resolveNumberTrack(timeline, `${layerId}.scaleY`, time, layer['scaleY'], 1),
    x: resolveNumberTrack(timeline, `${layerId}.x`, time, layer.x, 0),
    y: resolveNumberTrack(timeline, `${layerId}.y`, time, layer.y, 0),
  };
}

export function resolvePhaseProgress(
  timeline: NormalizedTimeline,
  phaseId: string,
  time: number
): number {
  const phase = indexTimeline(timeline).phasesById.get(phaseId);
  if (!phase?.enabled || !isSceneEnabled(timeline.scenes, phase.sceneId)) return 0;
  return segment(time, phase.start, phase.start + phase.duration);
}

export function resolveTrackValue(
  timeline: NormalizedTimeline,
  trackId: string,
  time: number,
  fallback: unknown
): unknown {
  const index = indexTimeline(timeline);
  const track = index.tracksById.get(trackId);
  if (
    !track?.enabled ||
    !isSceneEnabled(timeline.scenes, track.sceneId) ||
    !isPhaseEnabled(timeline, track.phaseId)
  ) {
    return fallback;
  }
  const motionPathValue = sampleRuntimeMotionPathTrackValue(timeline, track, time);
  if (motionPathValue !== null) return motionPathValue;
  const keyframes = index.activeKeyframesByTrack.get(track) ?? [];
  if (keyframes.length === 0) return fallback;
  const first = keyframes[0]!;
  if (time <= first.time) return first.value ?? fallback;
  const last = keyframes.at(-1)!;
  if (time >= last.time) return last.value ?? fallback;
  const segmentIndex = findKeyframeSegmentIndex(keyframes, time);
  const from = keyframes[segmentIndex]!;
  const to = keyframes[segmentIndex + 1]!;
  const raw = segment(time, from.time, to.time);
  return interpolateTimelineValue(from.value, to.value, resolveTimelineEase(from, raw));
}

function resolveNumberTrack(
  timeline: NormalizedTimeline,
  trackId: string,
  time: number,
  value: unknown,
  fallback: number
): number {
  const base = Number.isFinite(Number(value)) ? Number(value) : fallback;
  const resolved = Number(resolveTrackValue(timeline, trackId, time, base));
  return Number.isFinite(resolved) ? resolved : base;
}

function findKeyframeSegmentIndex(
  keyframes: readonly NormalizedTimelineKeyframe[],
  time: number
): number {
  let low = 1;
  let high = keyframes.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (time <= keyframes[middle]!.time) high = middle;
    else low = middle + 1;
  }
  return low - 1;
}

function fallbackLayer(layerId: string): NormalizedLayer {
  return { id: layerId, opacity: 1, type: 'customDraw', visible: true, x: 0, y: 0 };
}
