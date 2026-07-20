import {
  createMotionPathGeometry,
  evaluateMotionPathGeometry,
  getMotionPathLayerProperty,
  type MotionPathGeometryResult,
} from './motion-path.js';
import type {
  NormalizedTimeline,
  NormalizedTimelineKeyframe,
  NormalizedTimelineTrack,
} from '../model/types.js';

const geometryCache = new WeakMap<NormalizedTimeline, Map<string, MotionPathGeometryResult>>();

export function sampleRuntimeMotionPathTrackValue(
  timeline: NormalizedTimeline,
  track: NormalizedTimelineTrack,
  time: number
): number | null {
  const owner = getMotionPathLayerProperty(track);
  if (!owner || !timeline.motionPaths) {
    return null;
  }
  let byLayer = geometryCache.get(timeline);
  if (!byLayer) {
    byLayer = new Map();
    geometryCache.set(timeline, byLayer);
  }
  let geometry = byLayer.get(owner.layerId);
  if (!geometry) {
    geometry = createMotionPathGeometry(timeline, owner.layerId, {
      getTrackKeyframes: (candidate) =>
        isRuntimeTrackEnabled(timeline, candidate)
          ? candidate.keyframes.filter((keyframe) => isRuntimeKeyframeEnabled(timeline, keyframe))
          : [],
    });
    byLayer.set(owner.layerId, geometry);
  }
  if (!geometry.ok) {
    return null;
  }
  const position = evaluateMotionPathGeometry(geometry, time);
  return position ? position[owner.property] : null;
}

function isRuntimeTrackEnabled(
  timeline: NormalizedTimeline,
  track: NormalizedTimelineTrack
): boolean {
  return (
    track.enabled &&
    isRuntimeSceneEnabled(timeline, track.sceneId) &&
    isRuntimePhaseEnabled(timeline, track.phaseId)
  );
}

function isRuntimeKeyframeEnabled(
  timeline: NormalizedTimeline,
  keyframe: NormalizedTimelineKeyframe
): boolean {
  return (
    keyframe.enabled &&
    isRuntimeSceneEnabled(timeline, keyframe.sceneId) &&
    isRuntimePhaseEnabled(timeline, keyframe.phaseId)
  );
}

function isRuntimePhaseEnabled(timeline: NormalizedTimeline, phaseId: string | null): boolean {
  if (!phaseId) {
    return true;
  }
  const phase = timeline.phases.find((entry) => entry.id === phaseId);
  return Boolean(phase?.enabled && isRuntimeSceneEnabled(timeline, phase.sceneId));
}

function isRuntimeSceneEnabled(timeline: NormalizedTimeline, sceneId: string | null): boolean {
  if (!sceneId) {
    return true;
  }
  return timeline.scenes.find((entry) => entry.id === sceneId)?.enabled !== false;
}
