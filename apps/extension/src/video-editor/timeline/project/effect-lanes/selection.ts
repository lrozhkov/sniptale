import { useState } from 'react';
import {
  buildVideoCompositionCursorSegments,
  buildVideoCompositionMotionSegments,
  buildVideoCompositionTransitionSegments,
} from '../../../../features/video/composition/timeline/lanes';
import type { VideoProject } from '../../../../features/video/project/types';
import { findVisibleProjectActionEvent } from '../../../project/operations/action-events';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../../contracts/selection';
import type {
  ProjectTimelineProps,
  TimelineEffectDragTarget,
  TimelineEffectSelection,
} from '../types';

function getTimelineEffectSelection(
  project: VideoProject,
  selection: VideoEditorSelection | undefined
): TimelineEffectSelection | null {
  if (!selection) {
    return null;
  }

  switch (selection.kind) {
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return buildVideoCompositionTransitionSegments(project).some(
        (segment) => segment.id === selection.transitionId
      )
        ? { kind: 'transition', segmentId: selection.transitionId }
        : null;
    case VideoEditorSelectionKind.CURSOR_SEGMENT: {
      const segment = buildVideoCompositionCursorSegments(project).find((item) =>
        item.sampleIds.includes(selection.sampleId)
      );
      return segment ? { kind: 'cursor', segmentId: segment.id } : null;
    }
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      return findVisibleProjectActionEvent(project, selection.actionEventId)
        ? { kind: 'action', segmentId: selection.actionEventId }
        : null;
    case VideoEditorSelectionKind.MOTION_REGION:
      return buildVideoCompositionMotionSegments(project).some(
        (segment) => segment.id === selection.motionRegionId
      )
        ? { kind: 'motion', segmentId: selection.motionRegionId }
        : null;
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.CLIP:
    case VideoEditorSelectionKind.TRACK:
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return null;
  }
}

export function createEffectSelection(target: TimelineEffectDragTarget): TimelineEffectSelection {
  return {
    kind: target.kind,
    segmentId: target.segmentId,
  };
}

type EffectSelectionCallbackKey =
  | 'onSelectActionSegment'
  | 'onSelectClip'
  | 'onSelectCursorSegment'
  | 'onSelectMotionRegion'
  | 'onSelectObjectTrack'
  | 'onSelectScene'
  | 'onSelectTransition';

export type EffectSelectionCallbacks = {
  [Key in EffectSelectionCallbackKey]: ProjectTimelineProps[Key] | undefined;
};

export function selectEffectTarget(
  target: TimelineEffectDragTarget,
  callbacks: EffectSelectionCallbacks
) {
  switch (target.kind) {
    case 'action':
      callbacks.onSelectActionSegment?.(target.actionEventId);
      return;
    case 'cursor':
      callbacks.onSelectCursorSegment?.(target.sampleId);
      return;
    case 'transition':
      if (target.transitionId ?? target.clipId) {
        callbacks.onSelectTransition?.((target.transitionId ?? target.clipId)!);
      }
      return;
    case 'motion':
      callbacks.onSelectMotionRegion?.(target.motionRegionId);
      return;
    case 'effect-instance':
      if (target.target.kind === 'clip') callbacks.onSelectClip?.(target.target.clipId);
      else if (target.target.kind === 'transition') {
        callbacks.onSelectTransition?.(target.target.transitionId);
      } else callbacks.onSelectScene?.();
      return;
  }
}

export function useResolvedEffectSelection(
  project: VideoProject,
  selection: VideoEditorSelection | undefined
) {
  const [optimisticSelection, setOptimisticSelection] = useState<TimelineEffectSelection | null>(
    null
  );

  return {
    selectedEffectSelection: getTimelineEffectSelection(project, selection) ?? optimisticSelection,
    setOptimisticSelection,
  };
}
