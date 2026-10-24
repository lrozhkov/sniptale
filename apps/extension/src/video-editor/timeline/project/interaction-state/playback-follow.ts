import type { ProjectTimelineProps } from '../types';
import type { useProjectTimelineViewState } from './viewport';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

/** Playback pages through the precise projection until the user takes control. */
export function useProjectTimelinePlaybackFollow(params: {
  currentTime: number;
  isPlaying: boolean;
  projectId: string;
  editing: boolean;
  pixelsPerSecond: number;
  viewportWidth: number;
  timelineRef: RefObject<HTMLDivElement | null>;
  navigateTo(time: number): void;
  readStartTime(): number;
}) {
  const {
    currentTime,
    isPlaying,
    projectId,
    editing,
    pixelsPerSecond,
    viewportWidth,
    timelineRef,
    navigateTo,
    readStartTime,
  } = params;
  const suspended = useRef(false);
  const previous = useRef({ playing: false, projectId: projectId });
  const position = useRef(0);
  const suspend = useCallback(() => {
    suspended.current = true;
  }, []);
  useLayoutEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const onScroll = () => {
      if (Math.abs(node.scrollLeft - position.current) > 1) suspend();
      position.current = node.scrollLeft;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== node) suspend();
    };
    const onWheel = (event: WheelEvent) => {
      if (
        event.deltaX ||
        event.ctrlKey ||
        (event.deltaY && (event.shiftKey || node.scrollHeight <= node.clientHeight))
      )
        suspend();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !['Tab', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key) &&
        (event.target !== node || event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      )
        suspend();
    };
    node.addEventListener('scroll', onScroll);
    node.addEventListener('pointerdown', onPointerDown, true);
    node.addEventListener('wheel', onWheel, { capture: true, passive: true });
    node.addEventListener('keydown', onKeyDown, true);
    return () => {
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('pointerdown', onPointerDown, true);
      node.removeEventListener('wheel', onWheel, true);
      node.removeEventListener('keydown', onKeyDown, true);
    };
  }, [timelineRef, suspend]);
  useLayoutEffect(() => {
    const start =
      isPlaying && (!previous.current.playing || previous.current.projectId !== projectId);
    previous.current = { playing: isPlaying, projectId: projectId };
    const node = timelineRef.current;
    if (start) {
      suspended.current = false;
      position.current = node?.scrollLeft ?? 0;
    }
    if (editing) suspended.current = true;
    if (
      !node ||
      !isPlaying ||
      suspended.current ||
      node.clientWidth <= 0 ||
      !Number.isFinite(currentTime) ||
      !Number.isFinite(pixelsPerSecond) ||
      pixelsPerSecond <= 0 ||
      document.visibilityState === 'hidden'
    )
      return;
    const x = (currentTime - readStartTime()) * pixelsPerSecond;
    if (x >= 0 && x < viewportWidth * 0.95) return;
    navigateTo(currentTime - (viewportWidth * 0.1) / pixelsPerSecond);
    position.current = node.scrollLeft;
  }, [
    currentTime,
    isPlaying,
    projectId,
    editing,
    pixelsPerSecond,
    viewportWidth,
    readStartTime,
    navigateTo,
    timelineRef,
  ]);
  return { suspend };
}

/** Manual view commands suspend playback paging before applying their navigation. */
export function useProjectTimelinePlaybackNavigation(
  props: Pick<ProjectTimelineProps, 'currentTime' | 'isPlaying' | 'project' | 'pixelsPerSecond'>,
  viewState: ReturnType<typeof useProjectTimelineViewState>,
  timelineRef: RefObject<HTMLDivElement | null>,
  viewportWidth: number,
  editing: boolean
) {
  const { suspend } = useProjectTimelinePlaybackFollow({
    currentTime: props.currentTime,
    isPlaying: props.isPlaying,
    projectId: props.project.id,
    pixelsPerSecond: props.pixelsPerSecond,
    viewportWidth,
    editing,
    timelineRef,
    navigateTo: viewState.navigateTo,
    readStartTime: viewState.readTimelineStartTime,
  });
  return {
    ...viewState,
    onZoomChange: (value: number) => {
      suspend();
      viewState.onZoomChange(value);
    },
    onFitProject: () => {
      suspend();
      viewState.onFitProject();
    },
    onFitSelection: () => {
      suspend();
      viewState.onFitSelection();
    },
  };
}
