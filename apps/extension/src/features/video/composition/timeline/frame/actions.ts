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
  for (const presentation of resolveVideoProjectActionPresentations(project)) {
    const state = resolveActionState(presentation, currentTime);
    if (state) {
      states.push(state);
    }
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
    clip.sourceInstanceId !== anchor.sourceInstanceId ||
    anchor.sourceTime < clip.sourceStart ||
    anchor.sourceTime >= clip.sourceStart + clip.sourceDuration
  )
    return null;
  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset) return null;
  return {
    frame: clip.transform,
    fitMode: clip.fitMode,
    sourceWidth: asset.metadata.width,
    sourceHeight: asset.metadata.height,
    renderState: resolveClipTransitionVisualState(project, clip, currentTime),
  };
}
