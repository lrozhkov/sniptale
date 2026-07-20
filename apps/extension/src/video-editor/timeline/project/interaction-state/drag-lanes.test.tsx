// @vitest-environment jsdom
import { useState, act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { getVideoProjectTrackLogicalLaneIdsThrough } from '../../../../features/video/project/timeline/logical-lanes';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoTrackKind,
  type VideoProjectClip,
  type VideoProject,
} from '../../../../features/video/project/types';
import { useProjectTimelineDrag } from './drag';

let beginClipInteraction: ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction'] | null =
  null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

it('creates a third logical lane before moving the preview to the lower physical track', () => {
  const project = createEmptyVideoProject('Third lane drag');
  const trackId = project.tracks[0]!.id;
  const clip = createClip(trackId);
  clip.timelineLaneId = 'line-2';
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.tracks.push({
    id: 'overlay-track',
    kind: VideoTrackKind.OVERLAY,
    locked: false,
    name: 'Overlay',
    order: 10,
    visible: true,
  });
  project.clips = [clip];
  const onMoveClip = vi.fn<MoveClipCallback>();

  renderDragHarness(project, onMoveClip);
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 60), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(120, 92);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 7, trackId, 'line-3');
  expect(container?.querySelector('[data-ghost-lane]')?.getAttribute('data-ghost-lane')).toBe(
    'line-3'
  );
});

it('keeps extending logical lanes during one drag instead of falling to the lower physical track', () => {
  const project = createProjectWithTwoTracks();
  const trackId = project.tracks[0]!.id;
  const clip = createClip(trackId);
  clip.timelineLaneId = 'line-2';
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };
  project.clips = [clip];
  const moves: Parameters<MoveClipCallback>[] = [];

  renderStatefulDragHarness(project, (...args) => moves.push(args));
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 60), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(120, 92);
  });
  act(() => {
    dispatchTimelinePointerMove(120, 180);
  });

  expect(moves.at(-1)).toEqual(['clip-1', 7, trackId, 'line-4']);
  expect(container?.querySelector('[data-ghost-lane]')?.getAttribute('data-ghost-lane')).toBe(
    'line-4'
  );
});

type MoveClipCallback = (
  clipId: string,
  startTime: number,
  trackId?: string,
  timelineLaneId?: string | null
) => void;

function renderDragHarness(
  project: ReturnType<typeof createEmptyVideoProject>,
  onMoveClip: MoveClipCallback
) {
  const Harness = createTimelineHarness({
    project,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
  });
  act(() => {
    root?.render(<Harness />);
  });
}

function renderStatefulDragHarness(project: VideoProject, onMove: MoveClipCallback) {
  act(() => {
    root?.render(<StatefulHarness />);
  });

  function StatefulHarness() {
    const [currentProject, setCurrentProject] = useState(project);
    const timelineDrag = useProjectTimelineDrag({
      pixelsPerSecond: 10,
      project: currentProject,
      onMoveClip: (clipId, startTime, trackId, timelineLaneId) => {
        onMove(clipId, startTime, trackId, timelineLaneId);
        setCurrentProject((nextProject) =>
          applyStatefulMove(nextProject, clipId, startTime, trackId, timelineLaneId)
        );
      },
      onSelectClip: () => undefined,
      onSelectTrack: () => undefined,
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: vi.fn(),
      onTrimClipStart: vi.fn(),
    });
    beginClipInteraction = timelineDrag.beginClipInteraction;

    return <div data-ghost-lane={timelineDrag.dragGhost?.timelineLaneId ?? ''} />;
  }
}

function createTimelineHarness(props: {
  project: VideoProject;
  onMoveClip: MoveClipCallback;
  onReady: (value: ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction']) => void;
}) {
  return function TimelineHarness() {
    const timelineDrag = useProjectTimelineDrag({
      pixelsPerSecond: 10,
      project: props.project,
      onMoveClip: props.onMoveClip,
      onSelectClip: () => undefined,
      onSelectTrack: () => undefined,
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: vi.fn(),
      onTrimClipStart: vi.fn(),
    });
    props.onReady(timelineDrag.beginClipInteraction);

    return <div data-ghost-lane={timelineDrag.dragGhost?.timelineLaneId ?? ''} />;
  };
}

function applyStatefulMove(
  project: VideoProject,
  clipId: string,
  startTime: number,
  trackId: string | undefined,
  timelineLaneId: string | null | undefined
): VideoProject {
  return {
    ...project,
    clips: project.clips.map((clip) =>
      clip.id === clipId ? applyStatefulClipMove(clip, startTime, trackId, timelineLaneId) : clip
    ),
    tracks: project.tracks.map((track) =>
      track.id === trackId && timelineLaneId !== undefined
        ? {
            ...track,
            logicalLanes: getVideoProjectTrackLogicalLaneIdsThrough(
              project,
              track.id,
              timelineLaneId
            ).map((id) => ({ id })),
          }
        : track
    ),
  };
}

function applyStatefulClipMove(
  clip: VideoProjectClip,
  startTime: number,
  trackId: string | undefined,
  timelineLaneId: string | null | undefined
): VideoProjectClip {
  return {
    ...clip,
    startTime,
    trackId: trackId ?? clip.trackId,
    ...(timelineLaneId === undefined ? {} : { timelineLaneId }),
  };
}

function createProjectWithTwoTracks(): VideoProject {
  const project = createEmptyVideoProject('Multi-line drag');
  project.tracks.push({
    id: 'overlay-track',
    kind: VideoTrackKind.OVERLAY,
    locked: false,
    name: 'Overlay',
    order: 10,
    visible: true,
  });
  return project;
}

function createClip(trackId: string): VideoProjectClip {
  return {
    assetId: 'asset-1',
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip 1',
    sourceDuration: 3,
    sourceStart: 0,
    startTime: 5,
    trackId,
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
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
