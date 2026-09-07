import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import {
  type EffectInteraction,
  type EffectMoveCallbacks,
  createEffectDraftCallbacks,
  isEffectDraftChanged,
  resolveEffectDisplayDraft,
  moveEffectTarget,
} from './drag';
import {
  createEffectSelection,
  type EffectSelectionCallbacks,
  selectEffectTarget,
  useResolvedEffectSelection,
} from './selection';
import type {
  ProjectTimelineProps,
  TimelineEffectDragTarget,
  TimelineEffectDragDraft,
  TimelineEffectSelection,
} from '../types';
import type {
  VideoEditorProjectHistoryTransactionActions,
  VideoEditorProjectHistoryTransactionLease,
} from '../../../contracts/commands/history';

interface UseProjectTimelineEffectInteractionsOptions {
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  pointerSessionCleanupRef?: React.MutableRefObject<(() => void) | null>;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  readTimelineStartTime?: (() => number) | undefined;
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
  refreshRef: React.MutableRefObject<(() => void) | null>;
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  interactionRef: React.MutableRefObject<EffectInteraction | null>;
}

interface EffectInteractionMovementOptions extends EffectInteractionSessionRefs {
  setDraft: React.Dispatch<React.SetStateAction<TimelineEffectDragDraft | null>>;
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  magnetEnabled: boolean;
  moveCallbacks: EffectMoveCallbacks;
  pixelsPerSecond: number;
  readTimelineStartTime?: (() => number) | undefined;
  project: VideoProject;
  projectDuration: number;
}

interface EffectInteractionSelectionOptions extends EffectSelectionCallbacks {
  setOptimisticSelection: React.Dispatch<React.SetStateAction<TimelineEffectSelection | null>>;
}

type BeginEffectInteractionOptions = EffectInteractionMovementOptions &
  EffectInteractionSelectionOptions;
type EffectPointerStartEvent = Pick<
  React.PointerEvent,
  'clientX' | 'preventDefault' | 'stopPropagation'
>;

function useEffectInteractionCleanup(
  cleanupRef: React.MutableRefObject<(() => void) | null>,
  interactionRef: React.MutableRefObject<EffectInteraction | null>,
  project: VideoProject
): void {
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      interactionRef.current = null;
    },
    [cleanupRef, interactionRef, project]
  );
}

function startEffectInteractionSession(
  options: EffectInteractionMovementOptions & {
    startClientX: number;
    target: TimelineEffectDragTarget;
  }
) {
  options.cleanupRef.current?.();
  options.interactionRef.current = {
    startClientX: options.startClientX,
    target: options.target,
  };

  const initialStartTime = options.readTimelineStartTime?.() ?? 0;
  let historyTransactionLease: VideoEditorProjectHistoryTransactionLease | null = null;
  let finished = false;
  let cleanupPointerSession: (() => void) | null = null;
  let pendingCommit: (() => void) | null = null;
  const draftCallbacks = createEffectDraftCallbacks(options.moveCallbacks, (commit, range) => {
    const changed = isEffectDraftChanged(options.target, range);
    pendingCommit = changed ? commit : null;
    options.setDraft(
      changed ? resolveEffectDisplayDraft(options.project, options.target, range) : null
    );
  });
  const endHistoryTransaction = () => {
    if (!historyTransactionLease) return;
    const lease = historyTransactionLease;
    historyTransactionLease = null;
    options.historyTransaction.endProjectHistoryTransaction(lease);
  };
  const finishInteraction = (commit = false) => {
    if (finished) return;
    finished = true;
    cleanupPointerSession?.();
    try {
      if (
        commit &&
        historyTransactionLease &&
        options.historyTransaction.isProjectHistoryTransactionCurrent(historyTransactionLease)
      )
        pendingCommit?.();
    } finally {
      pendingCommit = null;
      endHistoryTransaction();
      options.setDraft(null);
      options.interactionRef.current = null;
      options.refreshRef.current = null;
    }
  };
  let lastMove: PointerEvent | null = null;
  const onMove = (moveEvent: PointerEvent) => {
    lastMove = moveEvent;
    const interaction = options.interactionRef.current;
    if (!interaction) {
      return;
    }

    if (
      !historyTransactionLease &&
      Math.abs(moveEvent.clientX - options.startClientX) < 4 &&
      (options.readTimelineStartTime?.() ?? 0) === initialStartTime
    )
      return;
    if (!historyTransactionLease) {
      historyTransactionLease = options.historyTransaction.beginProjectHistoryTransaction();
    }
    if (
      !historyTransactionLease ||
      !options.historyTransaction.isProjectHistoryTransactionCurrent(historyTransactionLease)
    ) {
      finishInteraction();
      return;
    }

    moveEffectTarget(
      interaction,
      options.magnetEnabled,
      options.pixelsPerSecond,
      options.project,
      options.projectDuration,
      moveEvent,
      draftCallbacks,
      (options.readTimelineStartTime?.() ?? 0) - initialStartTime
    );
  };
  options.refreshRef.current = () => {
    if (lastMove) onMove(lastMove);
  };
  cleanupPointerSession = startWindowPointerSession({
    onMove,
    onEnd: () => finishInteraction(true),
    onCancel: () => finishInteraction(),
  });
  options.cleanupRef.current = () => {
    cleanupPointerSession?.();
    finishInteraction();
  };
}

function createBeginEffectInteraction(options: BeginEffectInteractionOptions) {
  return (event: EffectPointerStartEvent, target: TimelineEffectDragTarget) => {
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
      setDraft: options.setDraft,
      cleanupRef: options.cleanupRef,
      refreshRef: options.refreshRef,
      historyTransaction: options.historyTransaction,
      interactionRef: options.interactionRef,
      magnetEnabled: options.magnetEnabled,
      moveCallbacks: options.moveCallbacks,
      pixelsPerSecond: options.pixelsPerSecond,
      readTimelineStartTime: options.readTimelineStartTime,
      project: options.project,
      projectDuration: options.projectDuration,
      startClientX: event.clientX,
      target,
    });
  };
}

function useBeginEffectInteractionCallback(options: BeginEffectInteractionOptions) {
  return useCallback(
    (event: EffectPointerStartEvent, target: TimelineEffectDragTarget) => {
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
  setDraft: React.Dispatch<React.SetStateAction<TimelineEffectDragDraft | null>>;
  setOptimisticSelection: React.Dispatch<React.SetStateAction<TimelineEffectSelection | null>>;
}): BeginEffectInteractionOptions {
  return {
    setDraft: args.setDraft,
    cleanupRef: args.refs.cleanupRef,
    refreshRef: args.refs.refreshRef,
    interactionRef: args.refs.interactionRef,
    historyTransaction: args.options.historyTransaction,
    magnetEnabled: args.options.magnetEnabled,
    moveCallbacks: createEffectMoveCallbacks(args.options),
    pixelsPerSecond: args.options.pixelsPerSecond,
    readTimelineStartTime: args.options.readTimelineStartTime,
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
  const [effectDragDraft, setDraft] = useState<TimelineEffectDragDraft | null>(null);
  const interactionRef = useRef<EffectInteraction | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const viewportStart = options.readTimelineStartTime?.();
  useLayoutEffect(() => refreshRef.current?.(), [viewportStart]);
  const localCleanupRef = useRef<(() => void) | null>(null);
  const cleanupRef = options.pointerSessionCleanupRef ?? localCleanupRef;
  const { selectedEffectSelection, setOptimisticSelection } = useResolvedEffectSelection(
    options.project,
    options.selection
  );

  useEffectInteractionCleanup(cleanupRef, interactionRef, options.project);

  const beginEffectInteraction = useBeginEffectInteractionCallback(
    createBeginEffectInteractionOptions({
      options,
      refs: { cleanupRef, interactionRef, refreshRef },
      setDraft,
      setOptimisticSelection,
    })
  );

  return {
    beginEffectInteraction,
    effectDragDraft,
    selectedEffectSelection,
  };
}
