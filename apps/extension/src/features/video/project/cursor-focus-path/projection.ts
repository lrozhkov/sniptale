import { mapProjectTimeToSourcePoint } from '../timeline/source-time';
import { getSourceTimedClipProjectOffset } from '../timeline/rate';
import { deriveRecordedCursorFocusPath } from './recorded';
import {
  simplifyCursorFocusPath,
  finishCapturedCursorSegment,
  compareCursorFocusKeys,
  insertCursorFocusKey,
  resolveAuthoredCursorFocusPath,
} from './authoring';
import { resolveVideoProjectActionOccurrences } from '../action-occurrences';
import type { VideoProject, VideoProjectCursorSample } from '../types';
import { evaluateCursorFocusSegment } from './evaluator';
import type { CursorFocusBinding, CursorFocusPath, CursorFocusSegment } from './types';

type ObservedSample = VideoProjectCursorSample;

function samplePoint(sample: ObservedSample, width: number, height: number) {
  if (sample.observation !== undefined && sample.observation !== 'observed') return null;
  if (
    sample.recordingPoint === null ||
    (!sample.visible && sample.observation !== 'observed') ||
    (sample.sourceAnchor && sample.recordingPoint === undefined)
  )
    return null;
  return sample.recordingPoint ?? { x: sample.x / width, y: sample.y / height };
}

/** Derives editable keys from retained facts; raw samples are never removed or rewritten. */
export function deriveProjectCursorFocusPath(
  project: VideoProject,
  retainedKeyId?: string
): CursorFocusPath {
  const segments = deriveCapturedCursorSegments(project);
  const occurrences = resolveVideoProjectActionOccurrences(project);
  appendProjectClickAnchors(segments, occurrences, project);
  appendProjectDwellAnchors(segments, project);
  appendProjectReleaseAnchors(segments, occurrences);
  segments.forEach(finishCapturedCursorSegment);
  const legacy = simplifyCursorFocusPath(
    {
      version: 1,
      smoothing: 0.5,
      sensitivity: 0.5,
      mode: project.motionRegions?.some((region) => region.focusMode === 'CURSOR')
        ? 'follow'
        : 'fixed',
      gapPolicy: 'hold',
      segments,
    },
    retainedKeyId
  );
  return {
    ...legacy,
    segments: [...legacy.segments, ...deriveSourceObservationFocusSegments(project, retainedKeyId)],
  };
}

function deriveSourceObservationFocusSegments(
  project: VideoProject,
  retainedKeyId?: string,
  observed = false
): CursorFocusSegment[] {
  return (project.cursorTrack?.sourceObservations ?? []).flatMap((group) => {
    const clip = project.clips.find(
      (item) => item.type === 'VIDEO' && item.sourceInstanceId === group.sourceInstanceId
    );
    const asset =
      clip?.type === 'VIDEO' ? project.assets.find((item) => item.id === clip.assetId) : undefined;
    if (!asset || !project.cursorTrack || !asset.metadata.duration) return [];
    const source = { ...asset.metadata, duration: asset.metadata.duration };
    const actionEvents = project.actionEvents.flatMap((event) => {
      const anchor = event.anchor;
      return anchor.kind === 'recording-source' &&
        anchor.recordingId === group.recordingId &&
        anchor.sourceInstanceId === group.sourceInstanceId
        ? [
            {
              id: event.id,
              kind: event.kind,
              time: anchor.sourceTime,
              recordingPoint: event.point,
              data: event.data,
            },
          ]
        : [];
    });
    const signals = (project.actionFeedback ?? []).flatMap((feedback) =>
      feedback.recordingId === group.recordingId &&
      feedback.sourceInstanceId === group.sourceInstanceId
        ? feedback.signals.map((signal) => ({
            ...signal,
            id: `${group.sourceInstanceId}:${signal.id}`,
          }))
        : []
    );
    const path = deriveRecordedCursorFocusPath(
      {
        cursorTrack: {
          ...project.cursorTrack,
          samples: group.samples.map((sample) => ({
            ...sample,
            id: `${group.sourceInstanceId}:${sample.id}`,
          })),
        },
        actionEvents,
        signals,
      },
      source,
      observed,
      retainedKeyId
    );
    return path.segments.map((segment) => ({
      ...segment,
      binding: {
        kind: 'recording-source' as const,
        recordingId: group.recordingId,
        sourceInstanceId: group.sourceInstanceId,
      },
    }));
  });
}

const sourceObservationPaths = new WeakMap<VideoProject, CursorFocusSegment[]>();

/** Trusted captured geometry uses the complete source run, independently of focus edits and skin. */
export function resolveProjectSourceCursorObservation(
  project: VideoProject,
  time: number,
  sourceClipId?: string,
  options?: { includeSourceEnd?: boolean }
): VideoProjectCursorSample | null | undefined {
  const groups = project.cursorTrack?.sourceObservations;
  if (!groups?.length) return undefined;
  const clip = project.clips.find(
    (item) =>
      item.type === 'VIDEO' &&
      (!sourceClipId || item.id === sourceClipId) &&
      time >= item.startTime &&
      (time < item.startTime + item.duration ||
        (options?.includeSourceEnd && time === item.startTime + item.duration)) &&
      groups.some((group) => group.sourceInstanceId === item.sourceInstanceId)
  );
  if (!clip || clip.type !== 'VIDEO') return undefined;
  const group = groups.find((item) => item.sourceInstanceId === clip.sourceInstanceId)!;
  let segments = sourceObservationPaths.get(project);
  if (!segments) {
    segments = deriveSourceObservationFocusSegments(project, undefined, true);
    sourceObservationPaths.set(project, segments);
  }
  const sourceTime = clip.playbackWindow
    ? mapProjectTimeToSourcePoint([clip], time, clip.id)?.sourceTime
    : time === clip.startTime + clip.duration
      ? clip.sourceStart + clip.sourceDuration
      : clip.sourceStart + (time - clip.startTime) * (clip.playbackRate ?? 1);
  if (sourceTime === undefined) return null;
  for (const [index, segment] of segments.entries()) {
    if (
      segment.binding.kind !== 'recording-source' ||
      segment.binding.sourceInstanceId !== group.sourceInstanceId
    )
      continue;
    const point = evaluateCursorFocusSegment(segment, sourceTime, 0.5);
    if (!point) continue;
    return {
      id: segment.id,
      time,
      x: point.x * project.width,
      y: point.y * project.height,
      visible: true,
      observation: 'observed',
      captureSegment: index,
      recordingPoint: { x: point.x, y: point.y },
      interpolation: 'LINEAR',
      sourceAnchor: {
        kind: 'recording-source',
        recordingId: group.recordingId,
        sourceClipId: clip.id,
        sourceTime,
      },
    };
  }
  return null;
}

/** Resolves one retained source run; a cut, gap or independent instance cannot be interpolated. */
export function resolveProjectCursorFocus(
  project: VideoProject,
  currentTime: number,
  path = resolveProjectCursorFocusPath(project),
  sourceClipId?: string
) {
  for (const segment of path.segments) {
    let sourceTime = currentTime;
    let runId = 'project';
    if (segment.binding.kind === 'recording-source') {
      const binding = segment.binding;
      const clip = project.clips.find(
        (item) =>
          item.type === 'VIDEO' &&
          (!sourceClipId || item.id === sourceClipId) &&
          (item.sourceInstanceId ?? item.id) === binding.sourceInstanceId &&
          currentTime >= item.startTime &&
          currentTime < item.startTime + item.duration
      );
      if (!clip || clip.type !== 'VIDEO') continue;
      runId = clip.id;
      const point = mapProjectTimeToSourcePoint([clip], currentTime, clip.id);
      if (!point) continue;
      sourceTime = point.sourceTime;
    }
    const point = evaluateCursorFocusSegment(segment, sourceTime, path.smoothing);
    if (point)
      return {
        ...point,
        segmentId: `${point.segmentId}:${runId}`,
        sourceClipId: runId === 'project' ? undefined : runId,
        sourceTime,
        time: currentTime,
        x: point.x * project.width,
        y: point.y * project.height,
        visible: true,
        id: segment.id,
      };
  }
  return null;
}

/** Timeline/inspector adapter projects authored source keys into each retained clip instance. */
export function resolveProjectCursorFocusSamples(
  project: VideoProject,
  includeDerived = false
): VideoProjectCursorSample[] {
  if (!project.cursorFocusPath && !includeDerived) return project.cursorTrack?.samples ?? [];
  const path = resolveProjectCursorFocusPath(project);
  return path.segments
    .flatMap<VideoProjectCursorSample>((segment) => {
      if (segment.binding.kind === 'project')
        return segment.keys.map((key) => ({
          ...project.cursorTrack?.samples.find((sample) => sample.id === key.id),
          id: key.id,
          time: key.time,
          x: key.x * project.width,
          y: key.y * project.height,
          visible: true,
        }));
      const binding = segment.binding;
      return projectCursorFocusKeyOccurrences(project, segment).map(({ key, clip, time }) => ({
        ...project.cursorTrack?.samples.find((sample) => sample.id === key.id),
        id: key.id,
        time,
        x: key.x * project.width,
        y: key.y * project.height,
        visible: true,
        sourceAnchor: {
          kind: 'recording-source' as const,
          recordingId: binding.recordingId,
          sourceClipId: clip.id,
          sourceTime: key.time,
        },
      }));
    })
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

/** Explicit manual authoring can fill an unavailable interval without fabricating observation. */
export function addProjectCursorFocusKey(
  project: VideoProject,
  time: number,
  id: string
): CursorFocusPath {
  const path = resolveProjectCursorFocusPath(project);
  const resolved = resolveProjectCursorFocus(project, time, path);
  if (resolved) {
    const segment = path.segments.find((item) => resolved.segmentId.startsWith(`${item.id}:`));
    if (segment)
      return insertCursorFocusKey(path, segment.id, {
        id,
        time: resolved.sourceTime,
        x: resolved.x / project.width,
        y: resolved.y / project.height,
      });
  }
  const clip = project.clips.find(
    (item) =>
      item.type === 'VIDEO' && time >= item.startTime && time < item.startTime + item.duration
  );
  const sourcePoint =
    clip?.type === 'VIDEO' ? mapProjectTimeToSourcePoint([clip], time, clip.id) : null;
  if (clip?.type === 'VIDEO' && !sourcePoint) return path;
  const sourceTime = sourcePoint?.sourceTime ?? time;
  const binding: CursorFocusBinding =
    clip?.type === 'VIDEO' && project.baseRecordingId
      ? {
          kind: 'recording-source',
          recordingId: project.baseRecordingId,
          sourceInstanceId: clip.sourceInstanceId ?? clip.id,
        }
      : { kind: 'project' };
  const sameBinding = path.segments.filter(
    (segment) => JSON.stringify(segment.binding) === JSON.stringify(binding)
  );
  const start = Math.max(
    clip?.type === 'VIDEO' ? clip.sourceStart : 0,
    ...sameBinding.filter((segment) => segment.end <= sourceTime).map((segment) => segment.end)
  );
  const end = Math.min(
    clip?.type === 'VIDEO' ? clip.sourceStart + clip.sourceDuration : project.duration,
    ...sameBinding.filter((segment) => segment.start >= sourceTime).map((segment) => segment.start)
  );
  return {
    ...path,
    segments: [
      ...path.segments,
      {
        id: `manual-segment:${id}`,
        binding,
        start,
        end,
        keys: [
          {
            id,
            time: Math.max(start, Math.min(end, sourceTime)),
            x: 0.5,
            y: 0.5,
            anchor: 'manual',
            interpolation: 'smooth',
          },
        ],
      },
    ],
  };
}

const resolvedPaths = new WeakMap<VideoProject, CursorFocusPath>();

/** Resolves disposable recorded anchors plus retained authored overrides for all project consumers. */
export function resolveProjectCursorFocusPath(
  project: VideoProject,
  retainedKeyId?: string
): CursorFocusPath {
  let resolved = resolvedPaths.get(project);
  if (!resolved) {
    resolved = resolveAuthoredCursorFocusPath(
      deriveProjectCursorFocusPath(project),
      project.cursorFocusPath
    );
    resolvedPaths.set(project, resolved);
  }
  if (
    !retainedKeyId ||
    resolved.segments.some((segment) => segment.keys.some((key) => key.id === retainedKeyId))
  )
    return resolved;
  return resolveAuthoredCursorFocusPath(
    deriveProjectCursorFocusPath(project, retainedKeyId),
    project.cursorFocusPath
  );
}

function deriveCapturedCursorSegments(project: VideoProject): CursorFocusSegment[] {
  const segments: CursorFocusSegment[] = [];
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const rows = (project.cursorTrack?.samples ?? [])
    .flatMap((sample) => {
      const clip = sample.sourceAnchor ? clips.get(sample.sourceAnchor.sourceClipId) : undefined;
      if (sample.sourceAnchor && !clip) return [];
      if (
        clip?.type === 'VIDEO' &&
        project.cursorTrack?.sourceObservations?.some(
          (group) =>
            group.sourceInstanceId === clip.sourceInstanceId &&
            group.recordingId === sample.sourceAnchor?.recordingId
        )
      )
        return [];
      const binding: CursorFocusBinding =
        sample.sourceAnchor && clip
          ? {
              kind: 'recording-source',
              recordingId: sample.sourceAnchor.recordingId,
              sourceInstanceId:
                clip.type === 'VIDEO' ? (clip.sourceInstanceId ?? clip.id) : clip.id,
            }
          : { kind: 'project' };
      return [
        {
          sample,
          binding,
          time: sample.sourceAnchor?.sourceTime ?? sample.time,
          end: clip?.type === 'VIDEO' ? clip.sourceStart + clip.sourceDuration : project.duration,
        },
      ];
    })
    .sort(
      (a, b) =>
        JSON.stringify(a.binding).localeCompare(JSON.stringify(b.binding)) ||
        (a.sample.captureSegment ?? 0) - (b.sample.captureSegment ?? 0) ||
        a.time - b.time ||
        a.sample.id.localeCompare(b.sample.id)
    );
  let active: CursorFocusSegment | undefined;
  let token = '';
  for (const row of rows) {
    const { sample, binding, time } = row;
    const currentToken = `${JSON.stringify(binding)}:${sample.captureSegment ?? 0}`;
    if (currentToken !== token) {
      if (active && JSON.stringify(active.binding) === JSON.stringify(binding))
        active.end = active.keys.at(-1)!.time;
      active = undefined;
      token = currentToken;
    }
    const point = samplePoint(sample, project.width, project.height);
    if (!point) {
      if (active && sample.observation !== 'observed') {
        active.end = active.keys.at(-1)!.time;
        active = undefined;
      }
      continue;
    }
    if (!active) {
      active = { id: `segment:${sample.id}`, binding, start: time, end: row.end, keys: [] };
      segments.push(active);
    }
    active.end = Math.max(active.end, row.end);
    const previous = active.keys.at(-1);
    active.keys.push({
      id: sample.id,
      time,
      ...point,
      anchor: previous ? 'movement' : 'boundary',
      interpolation: 'smooth',
    });
  }
  return segments;
}

type FocusActionOccurrence = ReturnType<typeof resolveVideoProjectActionOccurrences>[number];

function appendProjectClickAnchors(
  segments: CursorFocusSegment[],
  occurrences: readonly FocusActionOccurrence[],
  scene: Pick<VideoProject, 'width' | 'height'>
): void {
  for (const occurrence of occurrences) {
    if (occurrence.event.kind !== 'CLICK' || !occurrence.event.point) continue;
    const anchor = occurrence.event.anchor;
    const time = anchor.kind === 'recording-source' ? anchor.sourceTime : occurrence.time;
    const segment = segments.find(
      (item) =>
        time >= item.start &&
        time <= item.end &&
        (item.binding.kind === 'project'
          ? anchor.kind === 'project'
          : anchor.kind === 'recording-source' &&
            anchor.sourceInstanceId === item.binding.sourceInstanceId)
    );
    if (!segment || segment.keys.some((key) => key.id === `click:${occurrence.eventId}`)) continue;
    segment.keys.push({
      id: `click:${occurrence.eventId}`,
      time,
      ...(anchor.kind === 'project'
        ? { x: occurrence.event.point.x / scene.width, y: occurrence.event.point.y / scene.height }
        : occurrence.event.point),
      anchor: 'click',
      interpolation: 'smooth',
    });
    segment.keys.sort(compareCursorFocusKeys);
  }
}

function appendProjectDwellAnchors(segments: CursorFocusSegment[], project: VideoProject): void {
  for (const group of project.actionFeedback ?? []) {
    for (const signal of group.signals) {
      if (signal.kind !== 'cursor-idle' || !signal.recordingPoint) continue;
      const segment = segments.find(
        (item) =>
          item.binding.kind === 'recording-source' &&
          item.binding.sourceInstanceId === group.sourceInstanceId &&
          signal.startTime >= item.start &&
          signal.endTime <= item.end
      );
      if (!segment) continue;
      segment.keys = segment.keys.filter(
        (key) =>
          key.anchor !== 'movement' || key.time <= signal.startTime || key.time >= signal.endTime
      );
      segment.keys.push(
        {
          id: `dwell-start:${group.sourceInstanceId}:${signal.id}`,
          time: signal.startTime,
          ...signal.recordingPoint,
          anchor: 'dwell',
          interpolation: 'hold',
        },
        {
          id: `dwell-end:${group.sourceInstanceId}:${signal.id}`,
          time: signal.endTime,
          ...signal.recordingPoint,
          anchor: 'dwell',
          interpolation: 'smooth',
        }
      );
    }
  }
}

function appendProjectReleaseAnchors(
  segments: CursorFocusSegment[],
  occurrences: readonly FocusActionOccurrence[]
): void {
  for (const occurrence of occurrences) {
    const event = occurrence.event;
    if (event.kind !== 'CLICK' || event.data['completion'] !== 'released') continue;
    const time = event.data['upTime'];
    const x = event.data['recordingUpX'];
    const y = event.data['recordingUpY'];
    if (
      typeof time !== 'number' ||
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(time) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    )
      continue;
    const anchor = event.anchor;
    const segment = segments.find(
      (item) =>
        time >= item.start &&
        time <= item.end &&
        (item.binding.kind === 'project'
          ? anchor.kind === 'project'
          : anchor.kind === 'recording-source' &&
            anchor.sourceInstanceId === item.binding.sourceInstanceId)
    );
    if (segment && !segment.keys.some((key) => key.id === `release:${event.id}`))
      segment.keys.push({
        id: `release:${event.id}`,
        time,
        x,
        y,
        anchor: 'click',
        interpolation: 'smooth',
      });
  }
}

/** Project source keys through matching retained clips, including both source endpoints. */
export function projectCursorFocusKeyOccurrences(
  project: VideoProject,
  segment: CursorFocusSegment
) {
  const binding = segment.binding;
  if (binding.kind !== 'recording-source') return [];
  return project.clips.flatMap((clip) => {
    if (clip.type !== 'VIDEO' || (clip.sourceInstanceId ?? clip.id) !== binding.sourceInstanceId)
      return [];
    const first = clip.playbackWindow
      ? mapProjectTimeToSourcePoint([clip], clip.startTime, clip.id)?.sourceTime
      : clip.sourceStart;
    const last = clip.playbackWindow
      ? mapProjectTimeToSourcePoint([clip], clip.startTime + clip.duration, clip.id)?.sourceTime
      : clip.sourceStart + clip.sourceDuration;
    if (first === undefined || last === undefined) return [];
    return segment.keys
      .filter((key) => key.time >= first && key.time <= last)
      .map((key) => ({
        key,
        clip,
        time:
          clip.startTime +
          Math.max(
            0,
            Math.min(
              clip.duration,
              getSourceTimedClipProjectOffset(clip, key.time - clip.sourceStart)
            )
          ),
      }));
  });
}
