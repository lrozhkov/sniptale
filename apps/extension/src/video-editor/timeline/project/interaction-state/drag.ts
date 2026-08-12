import { useEffect, useMemo, useRef, useState } from 'react';
import { getClipEndTime, getSortedTracks } from '../../../../features/video/project/timeline';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import { buildTimelineTrackLayoutModel } from '../tracks/layout';
import type { DragMode, TimelineClipDragGhost, TimelineInteraction } from '../types';
import { applyTimelineDragMove, type MoveClipHandler } from './drag-move';
import { isVideoEditorPresentedTrack } from '../../../project/operations/presented-tracks';
import type {
  VideoEditorProjectHistoryTransactionActions,
  VideoEditorProjectHistoryTransactionLease,
} from '../../../contracts/commands/history';

interface UseProjectTimelineDragOptions {
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  pointerSessionCleanupRef?: React.MutableRefObject<(() => void) | null>;
  pixelsPerSecond: number;
  project: VideoProject;
  trackHeightByTrackId?: Record<string, VideoEditorTrackHeightMultiplier>;
  onMoveClip: MoveClipHandler;
  onSelectClip: (clipId: string | null) => void;
  onSelectTrack: (trackId: string | null) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
  onTrimClipEnd: (clipId: string, nextEndTime: number) => void;
  onTrimClipStart: (clipId: string, nextStartTime: number) => void;
}

const CLIP_DRAG_THRESHOLD_PX = 4;
type TimelineClipPointerStartEvent = Pick<
  React.PointerEvent,
  'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
>;

type TimelineDragSessionParams = Pick<
  UseProjectTimelineDragOptions,
  | 'onMoveClip'
  | 'historyTransaction'
  | 'onSelectClip'
  | 'onSelectTrack'
  | 'onTimelinePreviewSuspendedChange'
  | 'onTrimClipEnd'
  | 'onTrimClipStart'
  | 'pixelsPerSecond'
> & {
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>;
  interactionRef: React.MutableRefObject<TimelineInteraction | null>;
  trackLayoutModelRef: React.MutableRefObject<ReturnType<typeof buildTimelineTrackLayoutModel>>;
};

type TimelineDragListenerParams = Pick<
  TimelineDragSessionParams,
  | 'interactionRef'
  | 'historyTransaction'
  | 'onMoveClip'
  | 'onTimelinePreviewSuspendedChange'
  | 'onTrimClipEnd'
  | 'onTrimClipStart'
  | 'pixelsPerSecond'
  | 'setDragGhost'
  | 'trackLayoutModelRef'
>;

function useTimelineDragCleanup(
  cleanupRef: React.MutableRefObject<(() => void) | null>,
  interactionRef: React.MutableRefObject<TimelineInteraction | null>,
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>,
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
      interactionRef.current = null;
    },
    [cleanupRef, interactionRef, previewSuspendedChangeRef, setDragGhost]
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
  historyTransaction,
  pointerSessionCleanupRef,
  pixelsPerSecond,
  project,
  onMoveClip,
  onSelectClip,
  onSelectTrack,
  onTimelinePreviewSuspendedChange,
  onTrimClipEnd,
  onTrimClipStart,
  trackHeightByTrackId = {},
}: UseProjectTimelineDragOptions) {
  const interactionRef = useRef<TimelineInteraction | null>(null);
  const localCleanupRef = useRef<(() => void) | null>(null);
  const cleanupRef = pointerSessionCleanupRef ?? localCleanupRef;
  const [dragGhost, setDragGhost] = useState<TimelineClipDragGhost | null>(null);
  const { trackLayoutModel, tracks } = useTimelineDragModel(project, trackHeightByTrackId);
  const trackLayoutModelRef = useRef(trackLayoutModel);
  trackLayoutModelRef.current = trackLayoutModel;

  useTimelineDragCleanup(
    cleanupRef,
    interactionRef,
    setDragGhost,
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
        historyTransaction,
        setDragGhost,
        cleanupRef,
        interactionRef,
        trackLayoutModelRef,
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

  return { beginClipInteraction, dragGhost, trackLayoutModel, tracks };
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
  historyTransaction,
  interactionRef,
  pixelsPerSecond,
  trackLayoutModelRef,
  onMoveClip,
  onTimelinePreviewSuspendedChange,
  onTrimClipEnd,
  onTrimClipStart,
  setDragGhost,
}: TimelineDragListenerParams): () => void {
  let dragActivated = false;
  let historyTransactionLease: VideoEditorProjectHistoryTransactionLease | null = null;
  let finished = false;

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
        interaction,
        moveEvent,
        pixelsPerSecond,
        trackLayoutModel: trackLayoutModelRef.current,
        onMoveClip,
        setDragGhost,
        onTrimClipEnd,
        onTrimClipStart,
      });
    },
    onEnd: finishInteraction,
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
