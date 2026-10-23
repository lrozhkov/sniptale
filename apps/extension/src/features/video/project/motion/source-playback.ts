import { materializeVideoProjectCursorSourceObservations } from '../cursor-source-observations';
import { getVideoClipPresentationTime, normalizeClipPlaybackRate } from '../timeline/rate';
import type { VideoProject, VideoProjectVideoClip, VideoProjectMotionRegion } from '../types';
import { isCameraMotionRegion } from './normalization';
import {
  getMotionPhaseSource,
  projectMotionSourceBinding,
  projectMotionSourcePhases,
} from './source-binding';
import { resolveMotionConnectionEdges, resolveMotionConnectionSource } from './index';

const sourceClockContexts = new WeakSet<VideoProject>();
const sourceClockViews = new WeakMap<
  VideoProject,
  {
    clipId: string;
    geometryProject: VideoProject;
    regionIds: ReadonlyMap<string, string>;
    padding: number;
  }
>();

function createMotionSourceGeometry(project: VideoProject, selected: VideoProjectVideoClip) {
  const selectedGroups = new Set(
    project.motionRegions?.flatMap((region) =>
      region.sourceBinding?.clipId === selected.id && region.sourceBinding.animationGroupId
        ? [region.sourceBinding.animationGroupId]
        : []
    )
  );
  const family = project.clips.filter(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      clip.assetId === selected.assetId &&
      (clip.id === selected.id ||
        (selected.sourceInstanceId !== undefined &&
          clip.sourceInstanceId === selected.sourceInstanceId) ||
        project.motionRegions?.some(
          (region) =>
            region.sourceBinding?.clipId === clip.id &&
            region.sourceBinding.animationGroupId !== undefined &&
            selectedGroups.has(region.sourceBinding.animationGroupId)
        ) === true)
  );
  const representatives = new Map<string, VideoProjectVideoClip>();
  const clipIds = new Map<string, string>();
  // Split windows retain the same original source interval. The selected part owns current geometry and rate.
  for (const clip of [selected, ...family.filter((item) => item.id !== selected.id)]) {
    const key = JSON.stringify([clip.sourceStart, clip.sourceDuration]);
    const representative = representatives.get(key) ?? clip;
    representatives.set(key, representative);
    clipIds.set(clip.id, representative.id);
  }
  const padding = Math.max(
    0,
    ...[...representatives.values()].map(
      (clip) => (clip.playbackWindow?.offset ?? 0) - clip.startTime
    )
  );
  const clips = [...representatives.values()].map((clip) => {
    const { playbackWindow, ...source } = clip;
    return {
      ...source,
      startTime: clip.startTime - (playbackWindow?.offset ?? 0) + padding,
      duration: clip.sourceDuration / normalizeClipPlaybackRate(clip.playbackRate ?? 1),
    };
  });
  const candidates = new Map<string, VideoProjectMotionRegion>();
  const groups = new Map<string, string>();
  for (const region of project.motionRegions ?? []) {
    const binding = region.sourceBinding;
    const clipId = binding && clipIds.get(binding.clipId);
    if (!binding || !clipId) continue;
    const key = JSON.stringify([clipId, binding.animationGroupId ?? region.id]);
    groups.set(region.id, key);
    if (!candidates.has(key) || binding.clipId === selected.id)
      candidates.set(key, { ...region, sourceBinding: { ...binding, clipId } });
  }
  const regionIds = new Map([...groups].map(([id, key]) => [id, candidates.get(key)!.id]));
  const geometryProject: VideoProject = {
    ...project,
    clips,
    duration: Math.max(0, ...clips.map((clip) => clip.startTime + clip.duration)),
    motionRegions: [...candidates.values()].map((region) => {
      const connection = region.incomingConnection;
      const from = connection && regionIds.get(connection.fromRegionId);
      return connection
        ? {
            ...region,
            incomingConnection:
              from && from !== region.id ? { ...connection, fromRegionId: from } : null,
          }
        : region;
    }),
  };
  geometryProject.motionRegions = geometryProject.motionRegions!.map((region) =>
    projectMotionSourceBinding(geometryProject, region)
  );
  const phases = projectMotionSourcePhases(project);
  geometryProject.motionRegions = geometryProject.motionRegions.map((region) => {
    if (!isCameraMotionRegion(region)) return region;
    const before = phases.motionRegions?.find((item) => item.id === region.id);
    if (!before) return region;
    const previous = resolveMotionConnectionEdges(phases, before);
    const current = resolveMotionConnectionEdges(geometryProject, region);
    const enter = previous.connectedIn && !current.connectedIn;
    const exit = previous.connectedOut && !current.connectedOut;
    return enter || exit
      ? {
          ...region,
          ...(enter ? { zoomInDuration: 0 } : {}),
          ...(exit ? { zoomOutDuration: 0 } : {}),
          phaseTransitions: {
            ...region.phaseTransitions,
            ...(enter ? { enter: 'none' as const } : {}),
            ...(exit ? { exit: 'none' as const } : {}),
          },
        }
      : region;
  });
  geometryProject.cursorTrack = materializeVideoProjectCursorSourceObservations(geometryProject);
  sourceClockContexts.add(geometryProject);
  return { clipId: selected.id, geometryProject, regionIds, padding };
}

/** Disposable camera geometry on the full retained source clock. Never save or use it as a media inventory. */
export function resolveMotionSourcePlayback(project: VideoProject, time: number, clipId?: string) {
  project = getMotionPhaseSource(project);
  if (sourceClockContexts.has(project)) return null;
  const phases = projectMotionSourcePhases(project);
  const active = phases.motionRegions
    ?.filter(
      (region) =>
        isCameraMotionRegion(region) &&
        time >= region.startTime &&
        time < region.startTime + region.duration
    )
    .toSorted((a, b) => b.startTime - a.startTime)[0];
  if (!clipId && active && !active.sourceBinding) return null;
  if (!clipId && !active) {
    for (const destination of phases.motionRegions ?? []) {
      if (!isCameraMotionRegion(destination) || time >= destination.startTime) continue;
      const source = resolveMotionConnectionSource(phases, destination);
      if (!source || time < source.startTime + source.duration) continue;
      const from = project.clips.find((clip) => clip.id === source.sourceBinding?.clipId);
      const to = project.clips.find((clip) => clip.id === destination.sourceBinding?.clipId);
      // Independent Native endpoints keep the existing project-time connection owner.
      if (
        from?.type !== 'VIDEO' ||
        to?.type !== 'VIDEO' ||
        from.assetId !== to.assetId ||
        (from.id !== to.id &&
          (from.sourceInstanceId === undefined || from.sourceInstanceId !== to.sourceInstanceId))
      )
        return null;
      break;
    }
  }
  const clipsById =
    !clipId && !active?.sourceBinding
      ? new Map(project.clips.map((clip) => [clip.id, clip]))
      : undefined;
  const selected = project.clips.find(
    (clip): clip is VideoProjectVideoClip =>
      clip.type === 'VIDEO' &&
      clip.playbackWindow !== undefined &&
      time >= clip.startTime &&
      (time < clip.startTime + clip.duration ||
        (clipId !== undefined && time === clip.startTime + clip.duration)) &&
      (clipId
        ? clip.id === clipId
        : active?.sourceBinding
          ? clip.id === active.sourceBinding.clipId
          : project.motionRegions?.some((region) => {
              const binding = region.sourceBinding;
              if (!isCameraMotionRegion(region) || !binding || binding.dormant) return false;
              const owner = clipsById?.get(binding.clipId);
              return (
                owner?.type === 'VIDEO' &&
                owner.assetId === clip.assetId &&
                (owner.id === clip.id ||
                  (clip.sourceInstanceId !== undefined &&
                    owner.sourceInstanceId === clip.sourceInstanceId))
              );
            }) === true)
  );
  if (!selected) return null;
  let view = sourceClockViews.get(project);
  if (view?.clipId !== selected.id) {
    view = createMotionSourceGeometry(project, selected);
    // One current source context per immutable snapshot avoids retaining a full view for every split part.
    sourceClockViews.set(project, view);
  }
  const sampleTime = getVideoClipPresentationTime(selected, time) + view.padding;
  const delta = sampleTime - time;
  let geometryProject = view.geometryProject;
  if (
    delta !== 0 &&
    (geometryProject.cursorFocusPath?.segments.some(
      (segment) => segment.binding.kind === 'project'
    ) ||
      geometryProject.cursorTrack?.samples.some((sample) => !sample.sourceAnchor) ||
      geometryProject.actionEvents.some((event) => event.anchor.kind === 'project'))
  ) {
    geometryProject = {
      ...geometryProject,
      ...(geometryProject.cursorFocusPath
        ? {
            cursorFocusPath: {
              ...geometryProject.cursorFocusPath,
              segments: geometryProject.cursorFocusPath.segments.map((segment) =>
                segment.binding.kind === 'project'
                  ? {
                      ...segment,
                      start: segment.start + delta,
                      end: segment.end + delta,
                      keys: segment.keys.map((key) => ({ ...key, time: key.time + delta })),
                    }
                  : segment
              ),
            },
          }
        : {}),
      cursorTrack: geometryProject.cursorTrack
        ? {
            ...geometryProject.cursorTrack,
            samples: geometryProject.cursorTrack.samples.map((sample) =>
              sample.sourceAnchor ? sample : { ...sample, time: sample.time + delta }
            ),
          }
        : null,
      actionEvents: geometryProject.actionEvents.map((event) =>
        event.anchor.kind === 'project'
          ? { ...event, anchor: { ...event.anchor, time: event.anchor.time + delta } }
          : event
      ),
    };
    sourceClockContexts.add(geometryProject);
  }
  return { geometryProject, time: sampleTime, regionIds: view.regionIds, sourceClip: selected };
}
