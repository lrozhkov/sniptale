import {
  getVideoClipPresentationTime,
  getMediaClipSourceTime,
  areVideoClipSourceClocksContinuous,
} from '../timeline/rate';
import {
  patchReviewKeys,
  REVIEW_KEY_DEFAULT,
  type ReviewKeyStyle,
  type ReviewKeyAnimation,
  type ReviewKeyPatch,
} from './key-animation';
import type { ReviewTimeSegment } from '../../review/timeline';
import type { VideoProject, VideoProjectActionEvent, VideoProjectVideoClip } from '../types';
import type {
  VideoProjectActionFeedback,
  ReviewActionAudioSetting,
  ReviewClickAnimation,
  ReviewClickStyle,
} from './types';
import { parseVideoProjectActionFeedback, REVIEW_CLICK_DEFAULT } from './validation';
import { isVideoProjectUtilityLaneLocked } from '../utility-lanes';

/** Functional authored-content update through the existing document history owner. */
export function patchVideoProjectActionFeedback(
  project: VideoProject,
  identity: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>,
  patch: {
    settings?: ReviewActionAudioSetting[];
    gestureStyles?: ReviewClickAnimation[];
    keyStyles?: ReviewKeyAnimation[];
  }
): VideoProject {
  if (isVideoProjectUtilityLaneLocked(project, 'actions')) return project;
  if (
    !project.actionFeedback?.some(
      (group) =>
        group.recordingId === identity.recordingId &&
        group.sourceInstanceId === identity.sourceInstanceId
    )
  )
    return project;
  const values = (project.actionFeedback ?? []).map((group) =>
    group.recordingId === identity.recordingId &&
    group.sourceInstanceId === identity.sourceInstanceId
      ? { ...group, ...patch }
      : group
  );
  const parsed = parseVideoProjectActionFeedback(values);
  return parsed
    ? { ...project, version: project.version >= 4 ? project.version : 3, actionFeedback: parsed }
    : project;
}

/** Captured holds and incomplete presses keep their observed source trajectory. */
export function isCapturedVideoProjectGesture(event: VideoProjectActionEvent): boolean {
  return (
    event.anchor.kind === 'recording-source' &&
    event.kind === 'CLICK' &&
    typeof event.data['gestureType'] === 'string' &&
    (event.data['gestureType'] !== 'click' || event.data['completion'] !== 'released')
  );
}

/** Ordinary recorded clicks use the Gallery style contract without changing capture facts. */
export function getVideoProjectClickStyle(
  project: VideoProject,
  event: VideoProjectActionEvent
): Readonly<ReviewClickStyle> | null {
  const anchor = event.anchor;
  if (
    anchor.kind !== 'recording-source' ||
    event.kind !== 'CLICK' ||
    isCapturedVideoProjectGesture(event)
  )
    return null;
  const group = project.actionFeedback?.find(
    (item) =>
      item.recordingId === anchor.recordingId && item.sourceInstanceId === anchor.sourceInstanceId
  );
  return group
    ? (group.gestureStyles?.find((style) => style.id === anchor.sourceEventId) ??
        REVIEW_CLICK_DEFAULT)
    : null;
}

function sourceClips(
  project: VideoProject,
  group: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>
) {
  return project.clips
    .filter((clip): clip is VideoProjectVideoClip => {
      if (clip.type !== 'VIDEO' || clip.sourceInstanceId !== group.sourceInstanceId) return false;
      const asset = project.assets.find((item) => item.id === clip.assetId);
      const recordingId =
        asset?.source.kind === 'recording'
          ? asset.source.recordingId
          : asset?.source.kind === 'project-asset'
            ? asset.source.originRecordingId
            : null;
      return (
        recordingId === group.recordingId &&
        project.tracks.some((track) => track.id === clip.trackId && track.visible)
      );
    })
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
}
function clipRuns(clips: readonly VideoProjectVideoClip[]): VideoProjectVideoClip[][] {
  const runs: VideoProjectVideoClip[][] = [];
  for (const clip of clips) {
    const run = runs.at(-1),
      previous = run?.at(-1);
    if (
      previous &&
      Math.abs(previous.startTime + previous.duration - clip.startTime) < 1e-6 &&
      areVideoClipSourceClocksContinuous(previous, clip)
    )
      run!.push(clip);
    else runs.push([clip]);
  }
  return runs;
}
function segments(clips: readonly VideoProjectVideoClip[], visual = false): ReviewTimeSegment[] {
  const result: ReviewTimeSegment[] = [];
  for (const clip of clips) {
    const window = clip.playbackWindow;
    const rate = clip.playbackRate ?? 1;
    const sourceStart =
      window && !visual
        ? Math.min(
            clip.sourceStart + clip.sourceDuration,
            getMediaClipSourceTime(clip, clip.startTime) + (clip.cameraTiming?.offsetSeconds ?? 0)
          )
        : clip.sourceStart;
    const sourceEnd =
      window && !visual
        ? Math.min(clip.sourceStart + clip.sourceDuration, sourceStart + clip.duration * rate)
        : clip.sourceStart + clip.sourceDuration;
    if (sourceEnd <= sourceStart) continue;
    const resultStart = clip.startTime - (visual ? (window?.offset ?? 0) : 0);
    const segment: ReviewTimeSegment = {
      sourceStart,
      sourceEnd,
      resultStart,
      resultEnd: window
        ? resultStart + (sourceEnd - sourceStart) / rate
        : clip.startTime + clip.duration,
      kind: rate === 1 ? 'keep' : 'speed',
      rate,
    };
    if (
      visual &&
      result.some(
        (item) =>
          item.sourceStart === segment.sourceStart &&
          item.sourceEnd === segment.sourceEnd &&
          Math.abs(item.resultStart - segment.resultStart) < 1e-6 &&
          item.rate === segment.rate
      )
    )
      continue;
    result.push(segment);
  }
  return result;
}

/** Gates an authored result-time cue through a physical clip and its retained visual hold. */
export function projectVideoProjectFeedbackInterval(
  clip: VideoProjectVideoClip,
  start: number,
  end: number
) {
  const physicalEnd = clip.startTime + clip.duration;
  if (!clip.playbackWindow) {
    const interval = {
      clipId: clip.id,
      start: Math.max(clip.startTime, start),
      end: Math.min(physicalEnd, end),
    };
    return interval.end > interval.start ? interval : null;
  }
  const last = getVideoClipPresentationTime(clip, physicalEnd);
  if (getVideoClipPresentationTime(clip, clip.startTime) >= end || last < start) return null;
  const interval = {
    clipId: clip.id,
    start: Math.max(clip.startTime, start),
    end:
      last < physicalEnd && last >= start && last < end ? physicalEnd : Math.min(physicalEnd, end),
  };
  return interval.end > interval.start ? interval : null;
}
/** Maps retained source fragments without restricting continuity to one track. */
export function getVideoProjectFeedbackRuns(
  project: VideoProject,
  identity: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>
): readonly {
  clips: readonly VideoProjectVideoClip[];
  segments: readonly ReviewTimeSegment[];
  visualSegments: readonly ReviewTimeSegment[];
}[] {
  return clipRuns(sourceClips(project, identity)).map((clips) => ({
    clips,
    segments: segments(clips),
    visualSegments: clips.some((clip) => clip.playbackWindow)
      ? segments(clips, true)
      : segments(clips),
  }));
}

/** Recorded command appearance shares Gallery defaults while source facts stay immutable. */
export function getVideoProjectKeyStyle(
  project: VideoProject,
  event: VideoProjectActionEvent
): Readonly<ReviewKeyStyle> | null {
  const anchor = event.anchor;
  if (anchor.kind !== 'recording-source' || event.kind !== 'KEY') return null;
  const group = project.actionFeedback?.find(
    (item) =>
      item.recordingId === anchor.recordingId && item.sourceInstanceId === anchor.sourceInstanceId
  );
  return group
    ? (group.keyStyles?.find((style) => style.id === anchor.sourceEventId) ?? REVIEW_KEY_DEFAULT)
    : null;
}

/** A caption target identifies authored source presentation without copying capture coordinates or time. */
interface VideoProjectKeyFeedbackTarget {
  recordingId: string;
  sourceInstanceId: string;
  sourceEventId: string;
}

/** Only existing captured commands with an admitted feedback group can receive caption patches. */
export function getVideoProjectKeyFeedbackTargets(
  project: VideoProject
): VideoProjectKeyFeedbackTarget[] {
  const groups = new Set(
    (project.actionFeedback ?? []).map((group) =>
      JSON.stringify([group.recordingId, group.sourceInstanceId])
    )
  );
  return project.actionEvents.flatMap((event) => {
    const anchor = event.anchor;
    return event.kind === 'KEY' &&
      anchor.kind === 'recording-source' &&
      groups.has(JSON.stringify([anchor.recordingId, anchor.sourceInstanceId]))
      ? [
          {
            recordingId: anchor.recordingId,
            sourceInstanceId: anchor.sourceInstanceId,
            sourceEventId: anchor.sourceEventId,
          },
        ]
      : [];
  });
}

/** Batch caption patches retain current values and validate the complete feedback only once. */
export function patchVideoProjectKeyFeedback(
  project: VideoProject,
  targets: readonly VideoProjectKeyFeedbackTarget[],
  patch: ReviewKeyPatch | null
): VideoProject {
  if (isVideoProjectUtilityLaneLocked(project, 'actions') || !project.actionFeedback)
    return project;
  const admitted = new Set(
    getVideoProjectKeyFeedbackTargets(project).map((target) =>
      JSON.stringify([target.recordingId, target.sourceInstanceId, target.sourceEventId])
    )
  );
  const selected = new Map<string, Set<string>>();
  for (const target of targets) {
    if (
      !admitted.has(
        JSON.stringify([target.recordingId, target.sourceInstanceId, target.sourceEventId])
      )
    )
      continue;
    const key = JSON.stringify([target.recordingId, target.sourceInstanceId]);
    const ids = selected.get(key) ?? new Set<string>();
    ids.add(target.sourceEventId);
    selected.set(key, ids);
  }
  let changed = false;
  const groups = project.actionFeedback.map((group) => {
    const ids = selected.get(JSON.stringify([group.recordingId, group.sourceInstanceId]));
    if (!ids || (patch === null && !group.keyStyles?.some((style) => ids.has(style.id))))
      return group;
    const keyStyles = patchReviewKeys(group.keyStyles ?? [], [...ids], patch);
    if (JSON.stringify(keyStyles) === JSON.stringify(group.keyStyles ?? [])) return group;
    changed = true;
    return { ...group, keyStyles };
  });
  if (!changed) return project;
  const parsed = parseVideoProjectActionFeedback(groups);
  return parsed
    ? { ...project, version: project.version >= 4 ? project.version : 3, actionFeedback: parsed }
    : project;
}
