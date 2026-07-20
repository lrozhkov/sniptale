import { useCallback, useEffect, useRef } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import { type EffectInteraction, type EffectMoveCallbacks, moveEffectTarget } from './drag';
import {
  createEffectSelection,
  type EffectSelectionCallbacks,
  selectEffectTarget,
  useResolvedEffectSelection,
} from './selection';
import type {
  ProjectTimelineProps,
  TimelineEffectDragTarget,
  TimelineEffectSelection,
} from '../types';

interface UseProjectTimelineEffectInteractionsOptions {
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  selection?: VideoEditorSelection;
  onMoveActionEvent: ProjectTimelineProps['onMoveActionEvent'];
  onResizeActionEvent: ProjectTimelineProps['onResizeActionEvent'];
  onMoveCursorSegment: ProjectTimelineProps['onMoveCursorSegment'];
  onMoveMotionRegion: ProjectTimelineProps['onMoveMotionRegion'];
  onResizeMotionRegion: ProjectTimelineProps['onResizeMotionRegion'];
  onMoveTransitionSegment: ProjectTimelineProps['onMoveTransitionSegment'];
  onUpdateEffectInstance: ProjectTimelineProps['onUpdateEffectInstance'];
  onSelectActionSegment?: ProjectTimelineProps['onSelectActionSegment'];
  onSelectClip?: ProjectTimelineProps['onSelectClip'];
  onSelectCursorSegment?: ProjectTimelineProps['onSelectCursorSegment'];
  onSelectMotionRegion?: ProjectTimelineProps['onSelectMotionRegion'];
  onSelectObjectTrack?: ProjectTimelineProps['onSelectObjectTrack'];
  onSelectScene?: ProjectTimelineProps['onSelectScene'];
  onSelectTransition?: ProjectTimelineProps['onSelectTransition'];
}

interface EffectInteractionSessionRefs {
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  interactionRef: React.MutableRefObject<EffectInteraction | null>;
}

interface EffectInteractionMovementOptions extends EffectInteractionSessionRefs {
  magnetEnabled: boolean;
  moveCallbacks: EffectMoveCallbacks;
  pixelsPerSecond: number;
  project: VideoProject;
  projectDuration: number;
}

interface EffectInteractionSelectionOptions extends EffectSelectionCallbacks {
  setOptimisticSelection: React.Dispatch<React.SetStateAction<TimelineEffectSelection | null>>;
}

type BeginEffectInteractionOptions = EffectInteractionMovementOptions &
  EffectInteractionSelectionOptions;

function useEffectInteractionCleanup(
  cleanupRef: React.MutableRefObject<(() => void) | null>,
  interactionRef: React.MutableRefObject<EffectInteraction | null>
): void {
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      interactionRef.current = null;
    },
    [cleanupRef, interactionRef]
  );
}

function startEffectInteractionSession(
  options: EffectInteractionMovementOptions & {
    startClientX: number;
    target: TimelineEffectDragTarget;
  }
) {
  options.interactionRef.current = {
    startClientX: options.startClientX,
    target: options.target,
  };

  options.cleanupRef.current?.();
  options.cleanupRef.current = startWindowPointerSession({
    onMove: (moveEvent) => {
      const interaction = options.interactionRef.current;
      if (!interaction) {
        return;
      }

      moveEffectTarget(
        interaction,
        options.magnetEnabled,
        options.pixelsPerSecond,
        options.project,
        options.projectDuration,
        moveEvent,
        options.moveCallbacks
      );
    },
    onEnd: () => {
      options.interactionRef.current = null;
    },
  });
}

function createBeginEffectInteraction(options: BeginEffectInteractionOptions) {
  return (event: React.PointerEvent, target: TimelineEffectDragTarget) => {
    event.preventDefault();
    event.stopPropagation();

    options.setOptimisticSelection(createEffectSelection(target));
    selectEffectTarget(target, {
      onSelectActionSegment: options.onSelectActionSegment,
      onSelectClip: options.onSelectClip,
      onSelectCursorSegment: options.onSelectCursorSegment,
      onSelectMotionRegion: options.onSelectMotionRegion,
      onSelectObjectTrack: options.onSelectObjectTrack,
      onSelectScene: options.onSelectScene,
      onSelectTransition: options.onSelectTransition,
    });

    startEffectInteractionSession({
      cleanupRef: options.cleanupRef,
      interactionRef: options.interactionRef,
      magnetEnabled: options.magnetEnabled,
      moveCallbacks: options.moveCallbacks,
      pixelsPerSecond: options.pixelsPerSecond,
      project: options.project,
      projectDuration: options.projectDuration,
      startClientX: event.clientX,
      target,
    });
  };
}

function useBeginEffectInteractionCallback(options: BeginEffectInteractionOptions) {
  return useCallback(
    (event: React.PointerEvent<Element>, target: TimelineEffectDragTarget) => {
      createBeginEffectInteraction(options)(event, target);
    },
    [options]
  );
}

function createEffectMoveCallbacks(
  options: Pick<
    UseProjectTimelineEffectInteractionsOptions,
    | 'onMoveActionEvent'
    | 'onMoveCursorSegment'
    | 'onMoveMotionRegion'
    | 'onMoveTransitionSegment'
    | 'onResizeActionEvent'
    | 'onResizeMotionRegion'
    | 'onUpdateEffectInstance'
  >
): EffectMoveCallbacks {
  return {
    onMoveActionEvent: options.onMoveActionEvent,
    onResizeActionEvent: options.onResizeActionEvent,
    onMoveCursorSegment: options.onMoveCursorSegment,
    onMoveMotionRegion: options.onMoveMotionRegion,
    onResizeMotionRegion: options.onResizeMotionRegion,
    onMoveTransitionSegment: options.onMoveTransitionSegment,
    onUpdateEffectInstance: options.onUpdateEffectInstance,
  };
}

function createBeginEffectInteractionOptions(args: {
  options: UseProjectTimelineEffectInteractionsOptions;
  refs: EffectInteractionSessionRefs;
  setOptimisticSelection: React.Dispatch<React.SetStateAction<TimelineEffectSelection | null>>;
}): BeginEffectInteractionOptions {
  return {
    cleanupRef: args.refs.cleanupRef,
    interactionRef: args.refs.interactionRef,
    magnetEnabled: args.options.magnetEnabled,
    moveCallbacks: createEffectMoveCallbacks(args.options),
    pixelsPerSecond: args.options.pixelsPerSecond,
    project: args.options.project,
    projectDuration: args.options.project.duration,
    onSelectActionSegment: args.options.onSelectActionSegment,
    onSelectClip: args.options.onSelectClip,
    onSelectCursorSegment: args.options.onSelectCursorSegment,
    onSelectMotionRegion: args.options.onSelectMotionRegion,
    onSelectObjectTrack: args.options.onSelectObjectTrack,
    onSelectScene: args.options.onSelectScene,
    onSelectTransition: args.options.onSelectTransition,
    setOptimisticSelection: args.setOptimisticSelection,
  };
}

export function useProjectTimelineEffectInteractions(
  options: UseProjectTimelineEffectInteractionsOptions
) {
  const interactionRef = useRef<EffectInteraction | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { selectedEffectSelection, setOptimisticSelection } = useResolvedEffectSelection(
    options.project,
    options.selection
  );

  useEffectInteractionCleanup(cleanupRef, interactionRef);

  const beginEffectInteraction = useBeginEffectInteractionCallback(
    createBeginEffectInteractionOptions({
      options,
      refs: { cleanupRef, interactionRef },
      setOptimisticSelection,
    })
  );

  return {
    beginEffectInteraction,
    selectedEffectSelection,
  };
}
