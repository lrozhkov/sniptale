import { REVIEW_KEY_VIEWPORT_WIDTH } from '../../../project/action-feedback/key-animation';
import {
  getVideoProjectClickStyle,
  getVideoProjectKeyStyle,
} from '../../../project/action-feedback/projection';
import { isCameraHiddenAt } from '../../../project/camera/visibility';
import {
  hasCameraMediaAt,
  resolveCameraClip,
  cameraSourceTime,
} from '../../../project/camera/animation';
import { evaluateProjectGestureFeedback } from '../../../review/project-action-audio';
import type { VideoProjectActionOccurrence } from '../../../project/action-occurrences';
import { resolveClipTransitionVisualState } from '../../../project/transition/presentation';
import type { VisualLayerSourcePointMapping } from '../../draw/fitted-media';
import {
  resolveVideoProjectActionPresentations,
  type ResolvedVideoProjectActionPresentation,
} from '../../../project/action-presentation';
import type { VideoProject } from '../../../project/types/index';
import type { VideoCompositionActionState } from '../../types';

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveActionState(
  presentation: ResolvedVideoProjectActionPresentation,
  currentTime: number
): VideoCompositionActionState | null {
  const { event, duration, animationStart, start, end } = presentation;
  if (!presentation.enabled || currentTime < start || currentTime >= end) {
    return null;
  }

  const interval = presentation.renderIntervals.find(
    (item) => currentTime >= item.start && currentTime < item.end
  );
  if (!interval) return null;
  return {
    occurrence: presentation.occurrence,
    clipId: interval.clipId,
    duration,
    clickStyle: presentation.clickStyle,
    keyStyle: presentation.keyStyle,
    easing: presentation.easing,
    event,
    preset: presentation.preset,
    renderKind: presentation.renderKind,
    point: presentation.point,
    progress: clampProgress((currentTime - animationStart) / duration),
    start,
  };
}

export function resolveVideoCompositionActions(
  project: VideoProject,
  currentTime: number
): VideoCompositionActionState[] {
  const states: VideoCompositionActionState[] = [];
  const keys = new Map<string, ResolvedVideoProjectActionPresentation>();
  for (const presentation of resolveVideoProjectActionPresentations(project)) {
    if (getVideoProjectClickStyle(project, presentation.event) !== null) continue;
    if (getVideoProjectKeyStyle(project, presentation.event) !== null) {
      if (presentation.enabled && presentation.start <= currentTime) {
        const previous = keys.get(presentation.keyStyle.position);
        if (!previous || previous.start <= presentation.start)
          keys.set(presentation.keyStyle.position, presentation);
      }
      continue;
    }
    const state = resolveActionState(presentation, currentTime);
    const anchor = state?.event.anchor;
    const authoredFeedback =
      anchor?.kind === 'recording-source' &&
      project.actionFeedback?.some(
        (group) =>
          group.recordingId === anchor.recordingId &&
          group.sourceInstanceId === anchor.sourceInstanceId &&
          group.gestureStyles?.some((style) => style.id === anchor.sourceEventId)
      );
    if (
      state &&
      !authoredFeedback &&
      !(
        typeof state.event.data['gestureType'] === 'string' &&
        (state.event.data['gestureType'] !== 'click' ||
          state.event.data['completion'] !== 'released')
      )
    ) {
      states.push(state);
    }
  }
  for (const presentation of keys.values()) {
    const state = resolveActionState(presentation, currentTime);
    if (state)
      states.push({ ...state, clipId: null, keyStyleViewportWidth: REVIEW_KEY_VIEWPORT_WIDTH });
  }
  for (const feedback of evaluateProjectGestureFeedback(project, currentTime)) {
    const clip = project.clips.find((clip) => clip.id === feedback.clipId);
    const instanceId = clip?.type === 'VIDEO' ? clip.sourceInstanceId : null;
    const event = project.actionEvents.find(
      (event) =>
        event.anchor.kind === 'recording-source' &&
        event.anchor.sourceEventId === feedback.eventId &&
        event.anchor.sourceInstanceId === instanceId
    );
    if (!event) continue;
    const occurrence = {
      event,
      eventId: event.id,
      clipId: feedback.clipId,
      time: currentTime,
      sourceInstanceId:
        event.anchor.kind === 'recording-source' ? event.anchor.sourceInstanceId : null,
      playbackRun: null,
    };
    states.push({
      gestureFeedback: feedback.frame,
      occurrence,
      clipId: feedback.clipId,
      duration: 1,
      event,
      preset: 'CLICK_PRESS',
      renderKind: 'accent',
      point: feedback.frame.point,
      progress: 0,
      start: currentTime,
    });
  }
  return states;
}

/** Exact media geometry for this appearance, shared by framing and direct point editing. */
export function resolveVideoCompositionActionSourceMapping(
  project: VideoProject,
  occurrence: VideoProjectActionOccurrence,
  currentTime: number
): Omit<VisualLayerSourcePointMapping, 'point'> | null {
  const anchor = occurrence.event.anchor;
  if (anchor.kind !== 'recording-source') return null;
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  if (
    clip?.type !== 'VIDEO' ||
    !hasCameraMediaAt(project, clip, currentTime) ||
    clip.sourceInstanceId !== anchor.sourceInstanceId ||
    anchor.sourceTime < clip.sourceStart ||
    anchor.sourceTime >= clip.sourceStart + clip.sourceDuration
  )
    return null;
  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset) return null;
  const camera = project.tracks.some(
    (track) => track.id === clip.trackId && track.role === 'CAMERA'
  );
  if (
    camera &&
    isCameraHiddenAt(clip.cameraHiddenRanges ?? [], cameraSourceTime(clip, currentTime))
  )
    return null;
  const visual = camera ? resolveCameraClip(clip, currentTime) : clip;
  return {
    mirrored: camera && clip.cameraMirrored === true,
    ...(camera && visual.cameraAppearance ? { cameraAppearance: visual.cameraAppearance } : {}),
    frame: visual.transform,
    fitMode: visual.fitMode,
    ...(clip.windowHeader && !camera ? { windowHeader: clip.windowHeader } : {}),
    ...(clip.sourceCrop ? { sourceCrop: clip.sourceCrop } : {}),
    ...(!camera && clip.windowCornerRadius !== undefined
      ? { windowCornerRadius: clip.windowCornerRadius }
      : {}),
    sourceWidth: asset.metadata.width,
    sourceHeight: asset.metadata.height,
    renderState: resolveClipTransitionVisualState(project, visual, currentTime),
  };
}
