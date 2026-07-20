import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  clampPlaybackRange,
  createPlaybackRange,
  type VideoEditorPlaybackRange,
} from '../../../interaction/playback/range';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import { resolveTimelineTimeFromClientX } from './seek';

interface UseProjectTimelineRangeOptions {
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
  projectDuration: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  onSetPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
}

type RangeSelectionSimpleClickHandler = (time: number) => void;

interface RangeDraftState {
  anchorTime: number;
  hasDragged: boolean;
  latestTime: number;
}

function resolveTimelineTime(
  timelineRef: RefObject<HTMLDivElement | null>,
  clientX: number,
  pixelsPerSecond: number,
  duration: number
): number | null {
  if (!timelineRef.current) {
    return null;
  }

  return Math.min(
    Math.max(0, duration),
    resolveTimelineTimeFromClientX(timelineRef.current, clientX, pixelsPerSecond)
  );
}

function createDraftPlaybackRange(
  draft: RangeDraftState,
  duration: number
): VideoEditorPlaybackRange | null {
  const range = createPlaybackRange(draft.anchorTime, draft.latestTime);
  if (!range) {
    return null;
  }

  return clampPlaybackRange(range, duration);
}

function createInitialDraft(anchorTime: number): RangeDraftState {
  return {
    anchorTime,
    hasDragged: false,
    latestTime: anchorTime,
  };
}

function updateDraftState(
  draft: RangeDraftState,
  startClientX: number,
  moveClientX: number,
  currentTime: number
): RangeDraftState {
  return {
    ...draft,
    hasDragged: draft.hasDragged || Math.abs(moveClientX - startClientX) >= 4,
    latestTime: currentTime,
  };
}

function completeDraftSelection(params: {
  clearDraftRange: () => void;
  draft: RangeDraftState | null;
  onSimpleClick: RangeSelectionSimpleClickHandler;
  onSetPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
  projectDuration: number;
}) {
  const range = params.draft
    ? createDraftPlaybackRange(params.draft, params.projectDuration)
    : null;
  params.clearDraftRange();
  if (!params.draft) {
    return;
  }

  if (!params.draft.hasDragged || !range) {
    params.onSimpleClick(params.draft.anchorTime);
    return;
  }

  params.onSetPlaybackRange(range);
  params.onSimpleClick(range.start);
}

function updatePointerDraft(params: {
  clientX: number;
  eventClientX: number;
  pixelsPerSecond: number;
  projectDuration: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  draftRef: React.MutableRefObject<RangeDraftState | null>;
  setDraftRange: React.Dispatch<React.SetStateAction<VideoEditorPlaybackRange | null>>;
}) {
  const currentTime = resolveTimelineTime(
    params.timelineRef,
    params.clientX,
    params.pixelsPerSecond,
    params.projectDuration
  );
  if (currentTime === null || !params.draftRef.current) {
    return;
  }

  params.draftRef.current = updateDraftState(
    params.draftRef.current,
    params.eventClientX,
    params.clientX,
    currentTime
  );
  params.setDraftRange(createDraftPlaybackRange(params.draftRef.current, params.projectDuration));
}

function useRangeDraftState() {
  const cleanupRef = useRef<(() => void) | null>(null);
  const draftRef = useRef<RangeDraftState | null>(null);
  const [draftRange, setDraftRange] = useState<VideoEditorPlaybackRange | null>(null);
  const clearDraftRange = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    draftRef.current = null;
    setDraftRange(null);
  }, []);

  useEffect(() => clearDraftRange, [clearDraftRange]);
  return { cleanupRef, clearDraftRange, draftRange, draftRef, setDraftRange };
}

function createRangeSelectionStartHandler(params: {
  clearDraftRange: () => void;
  cleanupRef: React.MutableRefObject<(() => void) | null>;
  draftRef: React.MutableRefObject<RangeDraftState | null>;
  onSimpleClick: RangeSelectionSimpleClickHandler;
  onSetPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
  pixelsPerSecond: number;
  projectDuration: number;
  setDraftRange: React.Dispatch<React.SetStateAction<VideoEditorPlaybackRange | null>>;
  timelineRef: RefObject<HTMLDivElement | null>;
}) {
  return (event: React.PointerEvent<HTMLDivElement>) => {
    const anchorTime = resolveTimelineTime(
      params.timelineRef,
      event.clientX,
      params.pixelsPerSecond,
      params.projectDuration
    );
    if (anchorTime === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    params.clearDraftRange();
    params.draftRef.current = createInitialDraft(anchorTime);
    params.cleanupRef.current = startWindowPointerSession({
      onMove: (moveEvent) =>
        updatePointerDraft({
          clientX: moveEvent.clientX,
          draftRef: params.draftRef,
          eventClientX: event.clientX,
          pixelsPerSecond: params.pixelsPerSecond,
          projectDuration: params.projectDuration,
          setDraftRange: params.setDraftRange,
          timelineRef: params.timelineRef,
        }),
      onEnd: () =>
        completeDraftSelection({
          clearDraftRange: params.clearDraftRange,
          draft: params.draftRef.current,
          onSimpleClick: params.onSimpleClick,
          onSetPlaybackRange: params.onSetPlaybackRange,
          projectDuration: params.projectDuration,
        }),
    });
  };
}

export function useProjectTimelineRangeSelection({
  pixelsPerSecond,
  playbackRange,
  projectDuration,
  timelineRef,
  onSeek,
  onSetPlaybackRange,
}: UseProjectTimelineRangeOptions) {
  const { cleanupRef, clearDraftRange, draftRange, draftRef, setDraftRange } = useRangeDraftState();
  const createSurfaceRangeSelectionStartHandler = useCallback(
    (onSimpleClick: RangeSelectionSimpleClickHandler) =>
      createRangeSelectionStartHandler({
        clearDraftRange,
        cleanupRef,
        draftRef,
        onSetPlaybackRange,
        onSimpleClick,
        pixelsPerSecond,
        projectDuration,
        setDraftRange,
        timelineRef,
      }),
    [
      clearDraftRange,
      cleanupRef,
      draftRef,
      onSetPlaybackRange,
      pixelsPerSecond,
      projectDuration,
      setDraftRange,
      timelineRef,
    ]
  );
  const beginRangeSelection = useMemo(
    () => createSurfaceRangeSelectionStartHandler(onSeek),
    [createSurfaceRangeSelectionStartHandler, onSeek]
  );

  return {
    beginRangeSelection,
    createSurfaceRangeSelectionStartHandler,
    visiblePlaybackRange: draftRange ?? playbackRange,
  };
}
