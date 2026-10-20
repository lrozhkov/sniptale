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
  patch: { settings?: ReviewActionAudioSetting[]; gestureStyles?: ReviewClickAnimation[] }
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
      Math.abs(previous.sourceStart + previous.sourceDuration - clip.sourceStart) < 1e-6
    )
      run!.push(clip);
    else runs.push([clip]);
  }
  return runs;
}
function segments(clips: readonly VideoProjectVideoClip[]): ReviewTimeSegment[] {
  return clips.map((clip) => ({
    sourceStart: clip.sourceStart,
    sourceEnd: clip.sourceStart + clip.sourceDuration,
    resultStart: clip.startTime,
    resultEnd: clip.startTime + clip.duration,
    kind: (clip.playbackRate ?? 1) === 1 ? 'keep' : 'speed',
    rate: clip.playbackRate ?? 1,
  }));
}
/** Maps retained source fragments without restricting continuity to one track. */
export function getVideoProjectFeedbackRuns(
  project: VideoProject,
  identity: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>
): readonly { clips: readonly VideoProjectVideoClip[]; segments: readonly ReviewTimeSegment[] }[] {
  return clipRuns(sourceClips(project, identity)).map((clips) => ({
    clips,
    segments: segments(clips),
  }));
}
