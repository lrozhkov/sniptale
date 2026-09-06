import { useEffect, useMemo, useRef, useState } from 'react';
import { getClipEndTime, getSortedTracks } from '../../../../features/video/project/timeline';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import { buildTimelineTrackLayoutModel } from '../tracks/layout';
import type { DragMode, TimelineClipDragGhost, TimelineInteraction } from '../types';
import {
  applyTimelineDragMove,
  createTimelineDragDraft,
  type MoveClipHandler,
  type TrimClipHandler,
} from './drag-move';
import { isVideoEditorPresentedTrack } from '../../../project/operations/presented-tracks';
import type {
  VideoEditorProjectHistoryTransactionActions,
  VideoEditorProjectHistoryTransactionLease,
} from '../../../contracts/commands/history';

interface UseProjectTimelineDragOptions {
  currentTime: number;
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  magnetEnabled: boolean;
  pointerSessionCleanupRef?: React.MutableRefObject<(() => void) | null>;
  pixelsPerSecond: number;
  project: VideoProject;
  trackHeightByTrackId?: Record<string, VideoEditorTrackHeightMultiplier>;
  onSwapClip: (clipId: string, direction: 'left' | 'right') => void;
  onMoveClip: MoveClipHandler;
  onSelectClip: (clipId: string | null) => void;
  onSelectTrack: (trackId: string | null) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
  onTrimClipEnd: TrimClipHandler;
  onTrimClipStart: TrimClipHandler;
}

const CLIP_DRAG_THRESHOLD_PX = 4;
const EMPTY_TRACK_HEIGHTS: Record<string, VideoEditorTrackHeightMultiplier> = {};
type TimelineClipPointerStartEvent = Pick<
  React.PointerEvent,
  'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
>;

type TimelineDragSessionParams = Pick<
  UseProjectTimelineDragOptions,
  | 'onSwapClip'
  | 'onMoveClip'
  | 'historyTransaction'
  | 'magnetEnabled'
  | 'onSelectClip'
  | 'onSelectTrack'
  | 'onTimelinePreviewSuspendedChange'
  | 'onTrimClipEnd'
  | 'onTrimClipStart'
  | 'pixelsPerSecond'
> & {
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  currentTimeRef: React.MutableRefObject<number>;
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>;
  setSnapGuideTime: React.Dispatch<React.SetStateAction<number | null>>;
  interactionRef: React.MutableRefObject<TimelineInteraction | null>;
  project: VideoProject;
  trackLayoutModelRef: React.MutableRefObject<ReturnType<typeof buildTimelineTrackLayoutModel>>;
};

type TimelineDragListenerParams = Pick<
  TimelineDragSessionParams,
  | 'interactionRef'
  | 'currentTimeRef'
  | 'historyTransaction'
  | 'magnetEnabled'
  | 'onSwapClip'
  | 'onMoveClip'
  | 'onTimelinePreviewSuspendedChange'
  | 'onTrimClipEnd'
  | 'onTrimClipStart'
  | 'pixelsPerSecond'
  | 'project'
  | 'setDragGhost'
  | 'setSnapGuideTime'
  | 'trackLayoutModelRef'
>;

function useTimelineDragCleanup(
  cleanupRef: React.MutableRefObject<(() => void) | null>,
  interactionRef: React.MutableRefObject<TimelineInteraction | null>,
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>,
  setSnapGuideTime: React.Dispatch<React.SetStateAction<number | null>>,
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void
): void {
  const previewSuspendedChangeRef = useRef(onTimelinePreviewSuspendedChange);
  useEffect(() => {
    previewSuspendedChangeRef.current = onTimelinePreviewSuspendedChange;
  }, [onTimelinePreviewSuspendedChange]);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      previewSuspendedChangeRef.current(false);
      setDragGhost(null);
      setSnapGuideTime(null);
      interactionRef.current = null;
    },
    [cleanupRef, interactionRef, previewSuspendedChangeRef, setDragGhost, setSnapGuideTime]
  );
}

function beginTimelineClipInteraction(
  params: TimelineDragSessionParams,
  args: {
    clip: VideoProjectClip;
    event: TimelineClipPointerStartEvent;
    mode: DragMode;
  }
) {
  args.event.stopPropagation();
  if (args.mode !== 'move') {
    args.event.preventDefault();
    params.onSelectClip(args.clip.id);
    params.onSelectTrack(args.clip.trackId);
  }

  params.cleanupRef.current?.();
  params.setSnapGuideTime(null);
  params.interactionRef.current = createTimelineInteraction(args.event, args.clip, args.mode);
  params.onTimelinePreviewSuspendedChange(true);
  params.cleanupRef.current = attachTimelinePointerListeners(params);
}

function createTimelineInteraction(
  event: TimelineClipPointerStartEvent,
  clip: VideoProjectClip,
  mode: DragMode
): TimelineInteraction {
  return {
    mode,
    clip,
    originalStart: clip.startTime,
    originalEnd: getClipEndTime(clip),
    originalTrackId: clip.trackId,
    startClientX: event.clientX,
    startClientY: event.clientY,
  };
}

export function useProjectTimelineDrag({
  currentTime,
  historyTransaction,
  magnetEnabled,
  pointerSessionCleanupRef,
  pixelsPerSecond,
  project,
  onSwapClip,
  onMoveClip,
  onSelectClip,
  onSelectTrack,
  onTimelinePreviewSuspendedChange,
  onTrimClipEnd,
  onTrimClipStart,
  trackHeightByTrackId = EMPTY_TRACK_HEIGHTS,
}: UseProjectTimelineDragOptions) {
  const interactionRef = useRef<TimelineInteraction | null>(null);
  const localCleanupRef = useRef<(() => void) | null>(null);
  const cleanupRef = pointerSessionCleanupRef ?? localCleanupRef;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const [dragGhost, setDragGhost] = useState<TimelineClipDragGhost | null>(null);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const { trackLayoutModel, tracks } = useTimelineDragModel(project, trackHeightByTrackId);
  const trackLayoutModelRef = useRef(trackLayoutModel);
  trackLayoutModelRef.current = trackLayoutModel;

  useEffect(
    () => () => {
      if (interactionRef.current) cleanupRef.current?.();
    },
    [cleanupRef, project, pixelsPerSecond, trackLayoutModel]
  );

  useTimelineDragCleanup(
    cleanupRef,
    interactionRef,
    setDragGhost,
    setSnapGuideTime,
    onTimelinePreviewSuspendedChange
  );

  const beginClipInteraction = (
    event: TimelineClipPointerStartEvent,
    clip: VideoProjectClip,
    mode: DragMode
  ) => {
    beginTimelineClipInteraction(
      {
        pixelsPerSecond,
        currentTimeRef,
        historyTransaction,
        magnetEnabled,
        project,
        setDragGhost,
        setSnapGuideTime,
        cleanupRef,
        interactionRef,
        trackLayoutModelRef,
        onSwapClip,
        onMoveClip,
        onSelectClip,
        onSelectTrack,
        onTimelinePreviewSuspendedChange,
        onTrimClipEnd,
        onTrimClipStart,
      },
      { clip, event, mode }
    );
  };

  return { beginClipInteraction, dragGhost, snapGuideTime, trackLayoutModel, tracks };
}

function useTimelineDragModel(
  project: VideoProject,
  trackHeightByTrackId: Record<string, VideoEditorTrackHeightMultiplier>
) {
  const tracks = useMemo(
    () => getSortedTracks(project).filter(isVideoEditorPresentedTrack),
    [project]
  );
  const trackLayoutModel = useMemo(
    () => buildTimelineTrackLayoutModel({ project, trackHeightByTrackId, tracks }),
    [project, trackHeightByTrackId, tracks]
  );
  return { trackLayoutModel, tracks };
}

function attachTimelinePointerListeners({
  currentTimeRef,
  historyTransaction,
  interactionRef,
  magnetEnabled,
  pixelsPerSecond,
  project,
  trackLayoutModelRef,
  onSwapClip,
  onMoveClip,
  onTimelinePreviewSuspendedChange,
  onTrimClipEnd,
  onTrimClipStart,
  setDragGhost,
  setSnapGuideTime,
}: TimelineDragListenerParams): () => void {
  let dragActivated = false;
  let historyTransactionLease: VideoEditorProjectHistoryTransactionLease | null = null;
  let finished = false;
  const draft = createTimelineDragDraft({
    project,
    onMoveClip,
    onSwapClip,
    onTrimClipStart,
    onTrimClipEnd,
  });

  const endHistoryTransaction = () => {
    if (!historyTransactionLease) return;
    const lease = historyTransactionLease;
    historyTransactionLease = null;
    historyTransaction.endProjectHistoryTransaction(lease);
  };
  const finishInteraction = () => {
    if (finished) return;
    finished = true;
    endHistoryTransaction();
    interactionRef.current = null;
    setDragGhost(null);
    setSnapGuideTime(null);
    onTimelinePreviewSuspendedChange(false);
  };

  const cleanupPointerSession = startWindowPointerSession({
    onMove: (moveEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) {
        return;
      }

      if (!shouldActivateTimelineDrag(interaction, moveEvent, dragActivated)) {
        return;
      }

      dragActivated = true;
      if (!historyTransactionLease) {
        historyTransactionLease = historyTransaction.beginProjectHistoryTransaction();
      }
      if (
        !historyTransactionLease ||
        !historyTransaction.isProjectHistoryTransactionCurrent(historyTransactionLease)
      ) {
        finishInteraction();
        return;
      }
      applyTimelineDragMove({
        currentTime: currentTimeRef.current,
        interaction,
        magnetEnabled,
        moveEvent,
        pixelsPerSecond,
        trackLayoutModel: trackLayoutModelRef.current,
        onSwapClip: draft.onSwapClip,
        onMoveClip: draft.onMoveClip,
        setDragGhost,
        onTrimClipEnd: draft.onTrimClipEnd,
        onTrimClipStart: draft.onTrimClipStart,
        project,
        setSnapGuideTime,
      });
    },
    onEnd: () => {
      try {
        if (
          !finished &&
          historyTransactionLease &&
          historyTransaction.isProjectHistoryTransactionCurrent(historyTransactionLease)
        ) {
          draft.commit();
        }
      } finally {
        finishInteraction();
      }
    },
    onCancel: finishInteraction,
  });

  return () => {
    cleanupPointerSession();
    finishInteraction();
  };
}

function shouldActivateTimelineDrag(
  interaction: TimelineInteraction,
  moveEvent: PointerEvent,
  dragActivated: boolean
) {
  if (interaction.mode !== 'move' || dragActivated) {
    return true;
  }

  const deltaClientX = moveEvent.clientX - interaction.startClientX;
  const deltaClientY = moveEvent.clientY - interaction.startClientY;
  return Math.hypot(deltaClientX, deltaClientY) >= CLIP_DRAG_THRESHOLD_PX;
}
