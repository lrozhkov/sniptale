import { useMemo, useRef, useState } from 'react';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import { useProjectTimelineEffectInteractions } from '../effect-lanes/interactions';
import type { ProjectTimelineProps } from '../types';
import { useProjectTimelineDrag } from './drag';
import { useProjectTimelineRangeSelection } from './range';
import { useProjectTimelineScrollSync } from './scroll-sync';
import { useTimelineSelectedTrackAutoScroll } from './selected-track-scroll';
import { useProjectTimelineSeek } from './seek';
import { useProjectTimelineViewState, useTimelineViewportWidth } from './viewport';

type TimelineRangeSelectionProps = Pick<
  ProjectTimelineProps,
  | 'onSeek'
  | 'onSelectScene'
  | 'onSelectTrack'
  | 'onSetPlaybackRange'
  | 'pixelsPerSecond'
  | 'playbackRange'
  | 'project'
>;
type TrackHeightState = Record<string, VideoEditorTrackHeightMultiplier>;

function useProjectTimelineInteractions(
  props: ProjectTimelineProps,
  trackHeightByTrackId: TrackHeightState,
  readTimelineStartTime: () => number,
  onMotionClick: (clientX: number) => void
) {
  const pointerSessionCleanupRef = useRef<(() => void) | null>(null);
  const { beginClipInteraction, dragGhost, snapGuideTime, trackLayoutModel, tracks } =
    useProjectTimelineDrag({
      currentTime: props.currentTime,
      historyTransaction: props.historyTransaction,
      magnetEnabled: props.magnetEnabled,
      pointerSessionCleanupRef,
      pixelsPerSecond: props.pixelsPerSecond,
      readTimelineStartTime,
      project: props.project,
      trackHeightByTrackId,
      onSwapClip: props.onSwapClip,
      onMoveClip: props.onMoveClip,
      onSelectClip: props.onSelectClip,
      onSelectTrack: props.onSelectTrack,
      onTimelinePreviewSuspendedChange: props.onTimelinePreviewSuspendedChange,
      onTrimClipEnd: props.onTrimClipEnd,
      onTrimClipStart: props.onTrimClipStart,
    });
  const { beginEffectInteraction, selectedEffectSelection, effectDragDraft } =
    useProjectTimelineEffectInteractions({
      onMotionClick,
      historyTransaction: props.historyTransaction,
      pointerSessionCleanupRef,
      magnetEnabled: props.magnetEnabled,
      pixelsPerSecond: props.pixelsPerSecond,
      readTimelineStartTime,
      project: props.project,
      selection: props.selection,
      onMoveCursorSegment: props.onMoveCursorSegment,
      onMoveActionOccurrence: props.onMoveActionOccurrence,
      onMoveMotionRegion: props.onMoveMotionRegion,
      onResizeMotionRegion: props.onResizeMotionRegion,
      onMoveTransitionSegment: props.onMoveTransitionSegment,
      onUpdateEffectInstance: props.onUpdateEffectInstance,
      onSelectClip: props.onSelectClip,
      onSelectActionOccurrence: props.onSelectActionOccurrence,
      onSelectCursorSegment: props.onSelectCursorSegment,
      onSelectMotionRegion: props.onSelectMotionRegion,
      onSelectObjectTrack: props.onSelectObjectTrack,
      onSelectScene: props.onSelectScene,
      onSelectTransition: props.onSelectTransition,
    });

  return {
    beginClipInteraction,
    dragGhost,
    snapGuideTime,
    beginEffectInteraction,
    effectDragDraft,
    selectedEffectSelection,
    trackLayoutModel,
    tracks,
  };
}

function useTimelineRangeSelectionState(
  props: TimelineRangeSelectionProps,
  timelineRef: React.MutableRefObject<HTMLDivElement | null>,
  readTimelineStartTime: () => number
) {
  const { onSeek, onSelectScene, onSetPlaybackRange, pixelsPerSecond, playbackRange, project } =
    props;
  const { beginRangeSelection, createSurfaceRangeSelectionStartHandler, visiblePlaybackRange } =
    useProjectTimelineRangeSelection({
      pixelsPerSecond,
      readTimelineStartTime,
      playbackRange,
      projectDuration: project.duration,
      timelineRef,
      onSeek,
      onSetPlaybackRange,
    });
  const beginEffectRangeSelection = useMemo(
    () =>
      createSurfaceRangeSelectionStartHandler((time) => {
        onSelectScene();
        onSeek(time);
      }),
    [createSurfaceRangeSelectionStartHandler, onSeek, onSelectScene]
  );
  const beginTrackRangeSelection = useMemo(
    () => (_trackId: string) =>
      createSurfaceRangeSelectionStartHandler((time) => {
        onSelectScene();
        onSeek(time);
      }),
    [createSurfaceRangeSelectionStartHandler, onSeek, onSelectScene]
  );

  return {
    beginEffectRangeSelection,
    beginRangeSelection,
    beginTrackRangeSelection,
    visiblePlaybackRange,
  };
}

function useProjectTimelinePlaybackState(
  props: TimelineRangeSelectionProps,
  scroll: ReturnType<typeof useProjectTimelineScrollSync>,
  readTimelineStartTime: () => number
) {
  const { onSeek, pixelsPerSecond } = props;
  const { timelineRef, trackListRef, syncTracksScroll } = scroll;
  const { beginPlayheadScrub, consumeCompletedScrubClick, handleTimelineSeek, seekToClientX } =
    useProjectTimelineSeek({
      pixelsPerSecond,
      readTimelineStartTime,
      projectDuration: props.project.duration,
      timelineRef,
      onSeek,
    });
  const {
    beginEffectRangeSelection,
    beginRangeSelection,
    beginTrackRangeSelection,
    visiblePlaybackRange,
  } = useTimelineRangeSelectionState(props, timelineRef, readTimelineStartTime);

  return {
    beginEffectRangeSelection,
    beginPlayheadScrub,
    consumeCompletedScrubClick,
    beginRangeSelection,
    beginTrackRangeSelection,
    handleTimelineSeek,
    seekToClientX,
    syncTracksScroll,
    timelineRef,
    trackListRef,
    visiblePlaybackRange,
  };
}

function useProjectTimelineDerivedState(
  project: ProjectTimelineProps['project'],
  pixelsPerSecond: number,
  selectedClipId: string | null,
  viewportWidth: number
) {
  const timelineWidth = useMemo(
    () => Math.max(Math.max(project.duration + 5, 10) * pixelsPerSecond, viewportWidth - 120),
    [pixelsPerSecond, project.duration, viewportWidth]
  );
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;

  return { selectedClip, timelineWidth };
}

export function useProjectTimelineState(
  props: ProjectTimelineProps,
  trackHeightByTrackId: TrackHeightState
) {
  const { pixelsPerSecond, project, selectedClipId } = props;
  const scroll = useProjectTimelineScrollSync();
  const viewportWidth = useTimelineViewportWidth(scroll.timelineRef);
  const { selectedClip, timelineWidth } = useProjectTimelineDerivedState(
    project,
    pixelsPerSecond,
    selectedClipId,
    viewportWidth
  );
  const viewState = useProjectTimelineViewState(
    props,
    selectedClip,
    viewportWidth,
    scroll.timelineRef
  );
  const playback = useProjectTimelinePlaybackState(props, scroll, viewState.readTimelineStartTime);
  const interactions = useProjectTimelineInteractions(
    props,
    trackHeightByTrackId,
    viewState.readTimelineStartTime,
    playback.seekToClientX
  );
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  useTimelineSelectedTrackAutoScroll({
    selectedTrackId: props.selectedTrackId,
    timelineRef: playback.timelineRef,
    trackLayoutModel: interactions.trackLayoutModel,
    trackListRef: playback.trackListRef,
  });

  return {
    hoveredClipId,
    ...interactions,
    ...playback,
    ...viewState,
    selectedClip,
    timelineWidth,
    setHoveredClipId,
  };
}
