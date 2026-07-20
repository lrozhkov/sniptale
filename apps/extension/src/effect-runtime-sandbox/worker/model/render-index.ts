import type {
  NormalizedClip,
  NormalizedLayer,
  NormalizedScene,
  NormalizedTimeline,
  NormalizedTimelineKeyframe,
  NormalizedTimelinePhase,
  NormalizedTimelineTrack,
} from './types.js';

interface TimelineIndex {
  activeKeyframesByTrack: Map<NormalizedTimelineTrack, NormalizedTimelineKeyframe[]>;
  phasesById: Map<string, NormalizedTimelinePhase>;
  scenesById: Map<string, NormalizedScene>;
  tracksById: Map<string, NormalizedTimelineTrack>;
}

const clipIndexes = new WeakMap<NormalizedClip[], Map<string, NormalizedClip[]>>();
const layerIndexes = new WeakMap<NormalizedLayer[], Map<string, NormalizedLayer>>();
const sceneIndexes = new WeakMap<NormalizedScene[], Map<string, NormalizedScene>>();
const timelineIndexes = new WeakMap<NormalizedTimeline, TimelineIndex>();

export function indexTimeline(timeline: NormalizedTimeline): TimelineIndex {
  const cached = timelineIndexes.get(timeline);
  if (cached) return cached;
  const index: TimelineIndex = {
    activeKeyframesByTrack: new Map(),
    phasesById: new Map(timeline.phases.map((phase) => [phase.id, phase])),
    scenesById: indexScenes(timeline.scenes),
    tracksById: new Map(timeline.tracks.map((track) => [track.id, track])),
  };
  timelineIndexes.set(timeline, index);
  for (const track of timeline.tracks) {
    index.activeKeyframesByTrack.set(
      track,
      track.keyframes.filter(
        (keyframe) =>
          keyframe.enabled &&
          isSceneEnabledFromIndex(index, keyframe.sceneId) &&
          isPhaseEnabledFromIndex(index, keyframe.phaseId)
      )
    );
  }
  return index;
}

export function indexLayers(layers: NormalizedLayer[]): Map<string, NormalizedLayer> {
  let index = layerIndexes.get(layers);
  if (!index) {
    index = new Map(layers.map((layer) => [layer.id, layer]));
    layerIndexes.set(layers, index);
  }
  return index;
}

export function indexClips(clips: NormalizedClip[]): Map<string, NormalizedClip[]> {
  let index = clipIndexes.get(clips);
  if (!index) {
    index = new Map();
    for (const clip of clips) {
      const layerClips = index.get(clip.layerId) ?? [];
      layerClips.push(clip);
      index.set(clip.layerId, layerClips);
    }
    clipIndexes.set(clips, index);
  }
  return index;
}

export function isSceneEnabled(
  scenes: NormalizedScene[] = [],
  sceneId: string | null = null
): boolean {
  if (!sceneId) return true;
  return indexScenes(scenes).get(sceneId)?.enabled !== false;
}

export function isPhaseEnabled(
  timeline: NormalizedTimeline,
  phaseId: string | null = null
): boolean {
  if (!phaseId) return true;
  const phase = indexTimeline(timeline).phasesById.get(phaseId);
  return Boolean(phase?.enabled && isSceneEnabled(timeline.scenes, phase.sceneId));
}

function indexScenes(scenes: NormalizedScene[]): Map<string, NormalizedScene> {
  let index = sceneIndexes.get(scenes);
  if (!index) {
    index = new Map(scenes.map((scene) => [scene.id, scene]));
    sceneIndexes.set(scenes, index);
  }
  return index;
}

function isSceneEnabledFromIndex(index: TimelineIndex, sceneId: string | null): boolean {
  if (!sceneId) return true;
  return index.scenesById.get(sceneId)?.enabled !== false;
}

function isPhaseEnabledFromIndex(index: TimelineIndex, phaseId: string | null): boolean {
  if (!phaseId) return true;
  const phase = index.phasesById.get(phaseId);
  return Boolean(phase?.enabled && isSceneEnabledFromIndex(index, phase.sceneId));
}
