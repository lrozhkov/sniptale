// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectClip,
} from '../../../../features/video/project/types';
import { useProjectTimelineDrag } from './drag';

function createClip(trackId: string): VideoProjectClip {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 5,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 3,
  };
}

function createTimelineHarness(props: {
  project: ReturnType<typeof createEmptyVideoProject>;
  onMoveClip: (
    clipId: string,
    startTime: number,
    trackId?: string,
    timelineLaneId?: string | null
  ) => void;
  onTrimClipEnd: (clipId: string, nextEndTime: number) => void;
  onTrimClipStart: (clipId: string, nextStartTime: number) => void;
  onReady: (value: ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction']) => void;
  onGhostChange?: (value: ReturnType<typeof useProjectTimelineDrag>['dragGhost']) => void;
  trackHeightByTrackId?: Record<string, 0.5 | 1 | 2 | 3>;
}) {
  return function TimelineHarness() {
    const timelineDrag = useProjectTimelineDrag({
      pixelsPerSecond: 10,
      project: props.project,
      ...(props.trackHeightByTrackId ? { trackHeightByTrackId: props.trackHeightByTrackId } : {}),
      onMoveClip: props.onMoveClip,
      onSelectClip: () => undefined,
      onSelectTrack: () => undefined,
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: props.onTrimClipEnd,
      onTrimClipStart: props.onTrimClipStart,
    });
    props.onReady(timelineDrag.beginClipInteraction);
    props.onGhostChange?.(timelineDrag.dragGhost);

    return <div data-ghost-lane={timelineDrag.dragGhost?.timelineLaneId ?? ''} />;
  };
}

function dispatchTimelinePointerMove(clientX: number, clientY: number) {
  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: clientX });
  Object.defineProperty(moveEvent, 'clientY', { value: clientY });
  window.dispatchEvent(moveEvent);
}

function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let beginClipInteraction: ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction'] | null =
  null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('moves the selected clip through pointer listeners and clears interaction on pointerup', () => {
  const project = createEmptyVideoProject('Timeline');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();
  const onTrimClipEnd = vi.fn<(clipId: string, nextEndTime: number) => void>();
  const onTrimClipStart = vi.fn<(clipId: string, nextStartTime: number) => void>();
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd,
    onTrimClipStart,
  });

  act(() => {
    root?.render(<Harness />);
  });

  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move');
  });

  act(() => {
    dispatchTimelinePointerMove(150, 40);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onMoveClip).toHaveBeenCalledWith('clip-1', 10, project.tracks[0]!.id, 'line-1');
  expect(onTrimClipStart).not.toHaveBeenCalled();
  expect(onTrimClipEnd).not.toHaveBeenCalled();
});

it('cleans up drag listeners when the timeline unmounts mid-interaction', () => {
  const project = createEmptyVideoProject('Unmount');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: vi.fn(),
    onTrimClipStart: vi.fn(),
  });

  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move');
  });
  act(() => {
    root?.unmount();
  });
  act(() => {
    dispatchTimelinePointerMove(150, 40);
  });

  expect(onMoveClip).not.toHaveBeenCalled();
});

it('moves clips to the intended track when rows have mixed heights', () => {
  const project = createEmptyVideoProject('Mixed heights');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: vi.fn(),
    onTrimClipStart: vi.fn(),
    trackHeightByTrackId: { [project.tracks[0]!.id]: 2 },
  });

  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 20), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(100, 120);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 5, project.tracks[1]!.id, 'line-1');
});

it('resolves the drag target logical lane while a clip is moved', () => {
  const project = createEmptyVideoProject('Drag ghost');
  const clip = createClip(project.tracks[0]!.id);
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: vi.fn(),
    onTrimClipStart: vi.fn(),
  });

  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 20), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(130, 53);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 8, project.tracks[0]!.id, 'line-2');
});

it('keeps the current logical lane during horizontal clip drags', () => {
  const project = createEmptyVideoProject('Horizontal lane intent');
  const clip = createClip(project.tracks[0]!.id);
  clip.timelineLaneId = 'line-1';
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: vi.fn(),
    onTrimClipStart: vi.fn(),
  });

  act(() => {
    root?.render(<Harness />);
  });
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 20), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(150, 20);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 10, project.tracks[0]!.id, 'line-1');
});
