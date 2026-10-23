import { getVideoClipPresentationTime } from '../project/timeline/rate';
import { REVIEW_CLICK_DEFAULT } from '../project/action-feedback/validation';
import { getVideoProjectActionPresentation } from '../project/action-presentation';
import type { VideoProject, RecordingActionEvent } from '../project/types';
import type {
  VideoProjectActionFeedback,
  ReviewActionAudioTarget,
  ReviewActionAudioStyle,
  ReviewClickStyle,
} from '../project/action-feedback/types';
import { buildReviewActionAudioPlan, type ReviewActionAudioPlan } from './action-audio';
import { scheduleReviewClicks, evaluateReviewClicks } from './click-animation';
import { projectReviewTelemetry } from './telemetry';
import { getVideoProjectFeedbackRuns } from '../project/action-feedback/projection';

/** Projects the original source gesture for presentation editing and rendering. */
export function projectActionFeedbackMarkers(
  project: VideoProject,
  group: VideoProjectActionFeedback,
  geometry = true
) {
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
  const captured = rawTrack?.sourceObservations?.find(
    (item) =>
      item.recordingId === group.recordingId && item.sourceInstanceId === group.sourceInstanceId
  );
  const cursorTrack = rawTrack
    ? {
        ...rawTrack,
        samples: (captured?.samples ?? rawTrack.samples).flatMap((sample) => {
          const anchor = sample.sourceAnchor;
          const sourceTime = captured ? sample.time : anchor?.sourceTime;
          if (sourceTime === undefined || (!captured && anchor?.recordingId !== group.recordingId))
            return [];
          const identity = JSON.stringify([
            sourceTime,
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
              time: sourceTime,
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
    ...getVideoProjectFeedbackRuns(project, group).flatMap((run) =>
      run.clips.map((clip) => clip.sourceStart + clip.sourceDuration)
    )
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
    const facts = projectActionFeedbackMarkers(project, group, false);
    for (const { clips, segments } of getVideoProjectFeedbackRuns(project, group)) {
      const plan = buildReviewActionAudioPlan({
        markers: facts,
        settings: group.settings,
        segments,
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
/** A read-only audition uses the selected instance and the existing source-to-project time map. */
export function buildProjectActionAudioAuditionPlan(
  project: VideoProject,
  identity: Pick<VideoProjectActionFeedback, 'recordingId' | 'sourceInstanceId'>,
  target: ReviewActionAudioTarget,
  style: ReviewActionAudioStyle
): ReviewActionAudioPlan {
  const group = project.actionFeedback?.find(
    (item) =>
      item.recordingId === identity.recordingId &&
      item.sourceInstanceId === identity.sourceInstanceId
  );
  if (
    !group ||
    (target.ref.kind === 'signal' &&
      group.signals.some(
        (signal) => signal.id === target.ref.id && signal.data['privacy'] === 'protected'
      ))
  )
    return { duration: project.duration, descriptors: [] };
  return buildProjectActionAudioPlan({
    ...project,
    actionPresentation: { ...getVideoProjectActionPresentation(project), enabled: true },
    actionFeedback: [{ ...group, settings: [{ ...style, enabled: true, ref: { ...target.ref } }] }],
  });
}

/** Gesture authoring and rendering inherit one project appearance without changing captured source facts. */
export function getProjectGestureFeedbackDefaults(project: VideoProject): ReviewClickStyle {
  const defaults = getVideoProjectActionPresentation(project);
  return {
    ...REVIEW_CLICK_DEFAULT,
    effect: defaults.enabled ? 'press' : 'off',
    ...(defaults.clickStyle
      ? {
          color: defaults.clickStyle.color,
          radius: defaults.clickStyle.size,
          stroke: defaults.clickStyle.strokeWidth,
          opacity: defaults.clickStyle.opacity,
        }
      : {}),
  };
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
      evaluateReviewClicks([cue], getVideoClipPresentationTime(clip, time)).map((frame) => ({
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
    const facts = projectActionFeedbackMarkers(project, group);
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
          ...getProjectGestureFeedbackDefaults(project),
          id: marker.ref.id,
        },
      ];
    });
    return getVideoProjectFeedbackRuns(project, group).map(({ clips, visualSegments }) => ({
      clips,
      cues: scheduleReviewClicks(facts, styles, visualSegments),
    }));
  });
}
