import { REVIEW_CLICK_DEFAULT } from '../project/action-feedback/validation';
import { getVideoProjectActionPresentation } from '../project/action-presentation';
import type { VideoProject, RecordingActionEvent, VideoProjectVideoClip } from '../project/types';
import type { VideoProjectActionFeedback } from '../project/action-feedback/types';
import { buildReviewActionAudioPlan, type ReviewActionAudioPlan } from './action-audio';
import { scheduleReviewClicks, evaluateReviewClicks } from './click-animation';
import { projectReviewTelemetry } from './telemetry';
import type { ReviewTimeSegment } from './timeline';

function sourceClips(project: VideoProject, group: VideoProjectActionFeedback) {
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
function markers(project: VideoProject, group: VideoProjectActionFeedback, geometry = true) {
  const actionEvents: RecordingActionEvent[] = project.actionEvents.flatMap((event) => {
    const anchor = event.anchor;
    if (
      anchor.kind !== 'recording-source' ||
      anchor.recordingId !== group.recordingId ||
      anchor.sourceInstanceId !== group.sourceInstanceId
    )
      return [];
    return [
      {
        id: anchor.sourceEventId,
        kind: event.kind,
        time: anchor.sourceTime,
        duration: event.capturedDuration ?? 0,
        point: event.point,
        recordingPoint: event.point,
        label: event.label,
        data: event.data,
        preset: 'NONE',
        ...(event.keyboardRepeats ? { keyboardRepeats: event.keyboardRepeats } : {}),
      },
    ];
  });
  const cursorIdentities = new Set<string>();
  const rawTrack = geometry ? project.cursorTrack : null;
  const cursorTrack = rawTrack
    ? {
        ...rawTrack,
        samples: rawTrack.samples.flatMap((sample) => {
          const anchor = sample.sourceAnchor;
          if (!anchor || anchor.recordingId !== group.recordingId) return [];
          const identity = JSON.stringify([
            anchor.sourceTime,
            sample.captureSegment,
            sample.visible,
            sample.observation,
            sample.recordingPoint?.x,
            sample.recordingPoint?.y,
          ]);
          if (cursorIdentities.has(identity)) return [];
          cursorIdentities.add(identity);
          return [
            {
              ...sample,
              time: anchor.sourceTime,
              x: sample.recordingPoint?.x ?? sample.x,
              y: sample.recordingPoint?.y ?? sample.y,
            },
          ];
        }),
      }
    : null;
  const duration = Math.max(
    0,
    ...actionEvents.map((event) => event.time + event.duration),
    ...group.signals.map((signal) => signal.endTime),
    ...sourceClips(project, group).map((clip) => clip.sourceStart + clip.sourceDuration)
  );
  return projectReviewTelemetry({ actionEvents, signals: group.signals, cursorTrack }, duration)
    .markers;
}
/** Both standalone audio consumers use the same source facts and complete retained instance maps. */
export function buildProjectActionAudioPlan(project: VideoProject): ReviewActionAudioPlan {
  const descriptors: ReviewActionAudioPlan['descriptors'][number][] = [];
  if (!getVideoProjectActionPresentation(project).enabled)
    return { duration: project.duration, descriptors };
  for (const group of project.actionFeedback ?? []) {
    const facts = markers(project, group, false);
    for (const clips of clipRuns(sourceClips(project, group))) {
      const plan = buildReviewActionAudioPlan({
        markers: facts,
        settings: group.settings,
        segments: segments(clips),
        applied: true,
      });
      for (const descriptor of plan.descriptors)
        descriptors.push({
          ...descriptor,
          id: JSON.stringify([
            group.recordingId,
            group.sourceInstanceId,
            clips[0]!.id,
            descriptor.id,
          ]),
        });
    }
  }
  return { duration: project.duration, descriptors };
}
const gesturePlans = new WeakMap<VideoProject, ReturnType<typeof prepareProjectGestureFeedback>>();

/** Both surfaces query one source/run plan per immutable project revision. */
export function evaluateProjectGestureFeedback(project: VideoProject, time: number) {
  if (!getVideoProjectActionPresentation(project).enabled) return [];
  let plan = gesturePlans.get(project);
  if (!plan) {
    plan = prepareProjectGestureFeedback(project);
    gesturePlans.set(project, plan);
  }
  return plan.flatMap(({ clips, cues }) => {
    const clip = clips.find(
      (item) => time >= item.startTime && time < item.startTime + item.duration
    );
    if (!clip) return [];
    return cues.flatMap((cue) =>
      evaluateReviewClicks([cue], time).map((frame) => ({
        frame,
        clipId: clip.id,
        eventId: cue.id!,
      }))
    );
  });
}

/** Source facts and timing are prepared together; random seeks retain no playback state. */
function prepareProjectGestureFeedback(project: VideoProject) {
  return (project.actionFeedback ?? []).flatMap((group) => {
    const facts = markers(project, group);
    const explicit = new Map((group.gestureStyles ?? []).map((style) => [style.id, style]));
    const defaults = getVideoProjectActionPresentation(project);
    const styles = facts.flatMap((marker) => {
      const event = project.actionEvents.find(
        (event) =>
          event.anchor.kind === 'recording-source' &&
          event.anchor.sourceInstanceId === group.sourceInstanceId &&
          event.anchor.sourceEventId === marker.ref.id
      );
      if (event?.presentation?.enabled === false) return [];
      const authored = explicit.get(marker.ref.id);
      if (authored) return [authored];
      if (
        !marker.gesture ||
        (marker.gesture.type === 'click' && marker.gesture.completion === 'released') ||
        !defaults.enabled
      )
        return [];
      return [
        {
          ...REVIEW_CLICK_DEFAULT,
          id: marker.ref.id,
          effect: 'press' as const,
          ...(defaults.clickStyle
            ? {
                color: defaults.clickStyle.color,
                radius: defaults.clickStyle.size,
                stroke: defaults.clickStyle.strokeWidth,
                opacity: defaults.clickStyle.opacity,
              }
            : {}),
        },
      ];
    });
    return clipRuns(sourceClips(project, group)).flatMap((clips) => {
      return [{ clips, cues: scheduleReviewClicks(facts, styles, segments(clips)) }];
    });
  });
}
