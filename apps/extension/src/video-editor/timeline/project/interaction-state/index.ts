import { useCallback, useMemo, useState } from 'react';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import { useProjectTimelineEffectInteractions } from '../effect-lanes/interactions';
import type { ProjectTimelineProps } from '../types';
import { useProjectTimelineDrag } from './drag';
import { useProjectTimelineRangeSelection } from './range';
import { useProjectTimelineScrollSync } from './scroll-sync';
import { useTimelineSelectedTrackAutoScroll } from './selected-track-scroll';
import { useProjectTimelineSeek } from './seek';
import { resolveTimelineFitPixelsPerSecond, useTimelineViewportWidth } from './viewport';

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
  trackHeightByTrackId: TrackHeightState
) {
  const { beginClipInteraction, dragGhost, trackLayoutModel, tracks } = useProjectTimelineDrag({
    pixelsPerSecond: props.pixelsPerSecond,
    project: props.project,
    trackHeightByTrackId,
    onMoveClip: props.onMoveClip,
    onSelectClip: props.onSelectClip,
    onSelectTrack: props.onSelectTrack,
    onTimelinePreviewSuspendedChange: props.onTimelinePreviewSuspendedChange,
    onTrimClipEnd: props.onTrimClipEnd,
    onTrimClipStart: props.onTrimClipStart,
  });
  const { beginEffectInteraction, selectedEffectSelection } = useProjectTimelineEffectInteractions({
    magnetEnabled: props.magnetEnabled,
    pixelsPerSecond: props.pixelsPerSecond,
    project: props.project,
    selection: props.selection,
    onMoveActionEvent: props.onMoveActionEvent,
    onResizeActionEvent: props.onResizeActionEvent,
    onMoveCursorSegment: props.onMoveCursorSegment,
    onMoveMotionRegion: props.onMoveMotionRegion,
    onResizeMotionRegion: props.onResizeMotionRegion,
    onMoveTransitionSegment: props.onMoveTransitionSegment,
    onUpdateEffectInstance: props.onUpdateEffectInstance,
    onSelectActionSegment: props.onSelectActionSegment,
    onSelectClip: props.onSelectClip,
    onSelectCursorSegment: props.onSelectCursorSegment,
    onSelectMotionRegion: props.onSelectMotionRegion,
    onSelectObjectTrack: props.onSelectObjectTrack,
    onSelectScene: props.onSelectScene,
    onSelectTransition: props.onSelectTransition,
  });

  return {
    beginClipInteraction,
    dragGhost,
    beginEffectInteraction,
    selectedEffectSelection,
    trackLayoutModel,
    tracks,
  };
}

function useTimelineRangeSelectionState(
  props: TimelineRangeSelectionProps,
  timelineRef: React.MutableRefObject<HTMLDivElement | null>
) {
  const { onSeek, onSelectScene, onSetPlaybackRange, pixelsPerSecond, playbackRange, project } =
    props;
  const { beginRangeSelection, createSurfaceRangeSelectionStartHandler, visiblePlaybackRange } =
    useProjectTimelineRangeSelection({
      pixelsPerSecond,
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

function useProjectTimelinePlaybackState(props: TimelineRangeSelectionProps) {
  const { onSeek, pixelsPerSecond } = props;
  const { timelineRef, trackListRef, syncTracksScroll } = useProjectTimelineScrollSync();
  const { handleTimelineSeek, seekToClientX } = useProjectTimelineSeek({
    pixelsPerSecond,
    timelineRef,
    onSeek,
  });
  const {
    beginEffectRangeSelection,
    beginRangeSelection,
    beginTrackRangeSelection,
    visiblePlaybackRange,
  } = useTimelineRangeSelectionState(props, timelineRef);

  return {
    beginEffectRangeSelection,
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
  selectedClipId: string | null
) {
  const timelineWidth = useMemo(
    () => Math.max(project.duration + 5, 10) * pixelsPerSecond,
    [pixelsPerSecond, project.duration]
  );
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) ?? null;

  return { selectedClip, timelineWidth };
}

function useProjectTimelineViewState(
  {
    onZoomChange,
    pixelsPerSecond,
    project,
  }: Pick<ProjectTimelineProps, 'onZoomChange' | 'pixelsPerSecond' | 'project'>,
  selectedClip: ReturnType<typeof useProjectTimelineDerivedState>['selectedClip'],
  timelineRef: React.MutableRefObject<HTMLDivElement | null>
) {
  const viewportWidth = useTimelineViewportWidth(timelineRef);
  const fitSelectionDuration = selectedClip?.duration ?? null;
  const visibleRangeSeconds = viewportWidth / Math.max(1, pixelsPerSecond);
  const onFitProject = useCallback(() => {
    onZoomChange(resolveTimelineFitPixelsPerSecond(project.duration, viewportWidth));
  }, [onZoomChange, project.duration, viewportWidth]);
  const onFitSelection = useCallback(() => {
    if (fitSelectionDuration === null) {
      return;
    }

    onZoomChange(resolveTimelineFitPixelsPerSecond(fitSelectionDuration, viewportWidth));
  }, [fitSelectionDuration, onZoomChange, viewportWidth]);

  return {
    fitSelectionDuration,
    onFitProject,
    onFitSelection,
    visibleRangeSeconds,
  };
}

export function useProjectTimelineState(
  props: ProjectTimelineProps,
  trackHeightByTrackId: TrackHeightState
) {
  const { pixelsPerSecond, project, selectedClipId } = props;
  const interactions = useProjectTimelineInteractions(props, trackHeightByTrackId);
  const playback = useProjectTimelinePlaybackState(props);
  const { selectedClip, timelineWidth } = useProjectTimelineDerivedState(
    project,
    pixelsPerSecond,
    selectedClipId
  );
  const viewState = useProjectTimelineViewState(props, selectedClip, playback.timelineRef);
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
