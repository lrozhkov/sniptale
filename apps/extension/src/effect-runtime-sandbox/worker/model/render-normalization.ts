import type {
  EffectClip,
  EffectScene,
  EffectTimeline,
  TimelineKeyframe,
} from '@sniptale/runtime-contracts/effect-v1';

import { clamp } from '../math.js';
import { normalizeMotionPaths } from '../timeline/motion-path.js';
import type {
  NormalizedClip,
  NormalizedScene,
  NormalizedTimeline,
  NormalizedTimelineHandles,
  NormalizedTimelineKeyframe,
} from './types.js';
export { normalizeLayers, normalizePathPoints } from './render-layer-normalization.js';

export function normalizeScenes(
  rawScenes: readonly EffectScene[],
  duration: number
): NormalizedScene[] {
  const safeDuration = Math.max(0.001, Number(duration) || 1);
  return rawScenes
    .map((scene, index) => ({
      duration: Math.max(0.001, Number(scene.duration) || safeDuration),
      enabled: scene.enabled !== false,
      id: String(scene.id || `scene-${index + 1}`),
      label: String(scene.label ?? scene.id),
      locked: Boolean(scene.locked),
      start: Math.max(0, Number(scene.start) || 0),
      transition: scene.transition ?? null,
    }))
    .filter((scene) => scene.id.length > 0);
}

export function resolveScene(time: number, scenes: readonly NormalizedScene[]): NormalizedScene {
  const list = scenes.filter((scene) => scene.enabled);
  const active = list.find((scene) => time >= scene.start && time < scene.start + scene.duration);
  if (active) return active;
  return (
    list.at(-1) ?? {
      duration: 1,
      enabled: true,
      id: 'main',
      label: '',
      locked: false,
      start: 0,
      transition: null,
    }
  );
}

export function normalizeTimeline(
  rawTimeline: EffectTimeline,
  duration: number,
  scenes: NormalizedScene[] = []
): NormalizedTimeline {
  const motionPaths = normalizeMotionPaths(rawTimeline.motionPaths);
  const phases = rawTimeline.phases
    .map((phase) => ({
      duration: Math.max(0.001, Number(phase.duration) || 0.001),
      enabled: phase.enabled !== false,
      id: String(phase.id),
      label: String(phase.label ?? phase.id),
      locked: Boolean(phase.locked),
      sceneId: typeof phase.sceneId === 'string' ? phase.sceneId : null,
      start: clamp(Number(phase.start) || 0, 0, duration),
    }))
    .filter((phase) => phase.id.length > 0);
  const tracks = rawTimeline.tracks
    .map((track) => ({
      enabled: track.enabled !== false,
      id: String(track.id),
      keyframes: normalizeKeyframes(track.keyframes, duration),
      label: String(track.label ?? ''),
      layerId: typeof track.layerId === 'string' ? track.layerId : null,
      phaseId: typeof track.phaseId === 'string' ? track.phaseId : null,
      property: String(track.property ?? ''),
      sceneId: typeof track.sceneId === 'string' ? track.sceneId : null,
      target: String(track.target ?? ''),
    }))
    .filter((track) => track.id.length > 0);
  return {
    duration,
    ...(motionPaths.length > 0 ? { motionPaths } : {}),
    phases,
    scenes,
    tracks,
  };
}

export function normalizeClips(
  rawClips: readonly EffectClip[],
  duration: number
): NormalizedClip[] {
  return rawClips
    .map((clip) => ({
      duration: Math.max(0.001, Number(clip.duration) || duration),
      enabled: clip.enabled !== false,
      layerId: String(clip.layerId),
      locked: Boolean(clip.locked),
      offset: Number(clip.offset) || 0,
      sceneId: typeof clip.sceneId === 'string' ? clip.sceneId : null,
      start: Math.max(0, Number(clip.start) || 0),
    }))
    .filter((clip) => clip.layerId.length > 0);
}

export function normalizeKeyframes(
  rawKeyframes: readonly TimelineKeyframe<unknown>[],
  duration: number
): NormalizedTimelineKeyframe[] {
  return rawKeyframes
    .map((keyframe, index) => ({
      easing: typeof keyframe.easing === 'string' ? keyframe.easing : 'linear',
      enabled: keyframe.enabled !== false,
      handles: normalizeHandles(keyframe.handles),
      id: String(keyframe.id || `k${index}`),
      phaseId: typeof keyframe.phaseId === 'string' ? keyframe.phaseId : null,
      sceneId: typeof keyframe.sceneId === 'string' ? keyframe.sceneId : null,
      time: clamp(Number(keyframe.time) || 0, 0, duration),
      value: keyframe.value,
    }))
    .sort((left, right) => left.time - right.time);
}

export function normalizeHandles(
  handles: TimelineKeyframe<unknown>['handles']
): NormalizedTimelineHandles {
  return {
    x1: clamp(Number(handles?.x1) || 0.25, 0, 1),
    x2: clamp(Number(handles?.x2) || 0.25, 0, 1),
    y1: clamp(Number(handles?.y1) || 0.1, 0, 1),
    y2: clamp(Number(handles?.y2) || 1, 0, 1),
  };
}
