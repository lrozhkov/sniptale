// @vitest-environment jsdom

import type React from 'react';
import { act, useRef } from 'react';
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
import { useVideoEditorStore, type VideoEditorState } from '../../../state/store';
import { usePlaybackShortcuts } from '../../../runtime/session/playback/shortcuts';
import type { PlaybackHandlers, PlaybackLatestState } from '../../../interaction/playback/types';
import type { VideoEditorProjectHistoryTransactionActions } from '../../../contracts/commands/history';

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
  historyTransaction?: VideoEditorProjectHistoryTransactionActions;
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
    const fallbackLease = Symbol('test-history-transaction');
    const timelineDrag = useProjectTimelineDrag({
      historyTransaction: props.historyTransaction ?? {
        beginProjectHistoryTransaction: () => fallbackLease,
        endProjectHistoryTransaction: () => undefined,
        isProjectHistoryTransactionCurrent: (lease) => lease === fallbackLease,
      },
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

function createPlaybackShortcutState(state: VideoEditorState): PlaybackLatestState {
  return {
    currentTime: state.currentTime,
    isPlaying: state.isPlaying,
    placementMode: state.placementMode,
    playbackRange: null,
    project: state.project,
    projectHistoryTransactionActive: state.projectHistory.transaction !== null,
    selectedActionEvent: null,
    selectedClipId: state.selectedClipId,
    selectedMotionRegion: null,
    selection: state.selection,
  };
}

function createPlaybackShortcutHandlers(state: VideoEditorState): PlaybackHandlers {
  return {
    clearPlacementMode: state.clearPlacementMode,
    deleteActionEvent: state.deleteActionEvent,
    deleteClip: state.deleteClip,
    deleteCursorSample: state.deleteCursorSample,
    deleteMotionRegion: state.deleteMotionRegion,
    deleteObjectTrack: state.deleteObjectTrack,
    setCurrentTime: state.setCurrentTime,
    setPlaying: state.setPlaying,
    splitClipAt: state.splitClipAt,
    updateActionEventDetails: state.updateActionEventDetails,
    updateClipTransform: state.updateClipTransform,
    updateMotionRegion: state.updateMotionRegion,
  };
}

function dispatchDeleteKeyDown(): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Delete' })
  );
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
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
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
  const historyLease = Symbol('test-history-transaction');
  const beginProjectHistoryTransaction = vi.fn(() => historyLease);
  const endProjectHistoryTransaction = vi.fn();
  const Harness = createTimelineHarness({
    historyTransaction: {
      beginProjectHistoryTransaction,
      endProjectHistoryTransaction,
      isProjectHistoryTransactionCurrent: (lease) => lease === historyLease,
    },
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
    dispatchTimelinePointerMove(160, 40);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(onMoveClip).toHaveBeenCalledWith('clip-1', 10, project.tracks[0]!.id, 'line-1');
  expect(onTrimClipStart).not.toHaveBeenCalled();
  expect(onTrimClipEnd).not.toHaveBeenCalled();
  expect(beginProjectHistoryTransaction).toHaveBeenCalledOnce();
  expect(endProjectHistoryTransaction).toHaveBeenCalledOnce();
});

it('stores a multi-frame clip drag as one undoable action', () => {
  const project = createEmptyVideoProject('Integrated drag');
  project.clips = [createClip(project.tracks[0]!.id)];
  useVideoEditorStore.getState().setProject(project);
  const activeProject = useVideoEditorStore.getState().project!;
  const clip = activeProject.clips[0]!;
  const Harness = createTimelineHarness({
    historyTransaction: {
      beginProjectHistoryTransaction: useVideoEditorStore.getState().beginProjectHistoryTransaction,
      endProjectHistoryTransaction: useVideoEditorStore.getState().endProjectHistoryTransaction,
      isProjectHistoryTransactionCurrent:
        useVideoEditorStore.getState().isProjectHistoryTransactionCurrent,
    },
    project: activeProject,
    onMoveClip: useVideoEditorStore.getState().moveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: useVideoEditorStore.getState().trimClipEnd,
    onTrimClipStart: useVideoEditorStore.getState().trimClipStart,
  });

  act(() => root?.render(<Harness />));
  act(() => beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => {
    dispatchTimelinePointerMove(120, 40);
    dispatchTimelinePointerMove(140, 40);
    dispatchTimelinePointerMove(160, 40);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(11);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  useVideoEditorStore.getState().undoProject();
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(5);
});

it('rejects an activated drag when its history snapshot cannot be created', () => {
  const project = createEmptyVideoProject('Snapshot failure');
  project.clips = [createClip(project.tracks[0]!.id)];
  project.duration = 12;
  useVideoEditorStore.getState().setProject(project);
  const activeProject = useVideoEditorStore.getState().project!;
  const clip = activeProject.clips[0]!;
  const onMoveClip = vi.fn(useVideoEditorStore.getState().moveClip);
  const Harness = createTimelineHarness({
    historyTransaction: {
      beginProjectHistoryTransaction: useVideoEditorStore.getState().beginProjectHistoryTransaction,
      endProjectHistoryTransaction: useVideoEditorStore.getState().endProjectHistoryTransaction,
      isProjectHistoryTransactionCurrent:
        useVideoEditorStore.getState().isProjectHistoryTransactionCurrent,
    },
    project: activeProject,
    onMoveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: useVideoEditorStore.getState().trimClipEnd,
    onTrimClipStart: useVideoEditorStore.getState().trimClipStart,
  });

  act(() => root?.render(<Harness />));
  vi.spyOn(globalThis, 'structuredClone').mockImplementationOnce(() => {
    throw new Error('snapshot failed');
  });
  act(() => beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => dispatchTimelinePointerMove(140, 40));

  expect(onMoveClip).not.toHaveBeenCalled();
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(5);
  expect(useVideoEditorStore.getState().projectHistory).toMatchObject({
    error: 'snapshotFailed',
    past: [],
    transaction: null,
  });
});

it('preserves redo when an activated drag is clamped to its original position', () => {
  const project = createEmptyVideoProject('Clamped drag');
  project.clips = [
    { ...createClip(project.tracks[0]!.id), startTime: 0, timelineLaneId: 'line-1' },
  ];
  project.duration = 3;
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().renameProject('Redo target');
  useVideoEditorStore.getState().undoProject();
  const activeProject = useVideoEditorStore.getState().project!;
  const clip = activeProject.clips[0]!;
  const Harness = createTimelineHarness({
    historyTransaction: {
      beginProjectHistoryTransaction: useVideoEditorStore.getState().beginProjectHistoryTransaction,
      endProjectHistoryTransaction: useVideoEditorStore.getState().endProjectHistoryTransaction,
      isProjectHistoryTransactionCurrent:
        useVideoEditorStore.getState().isProjectHistoryTransactionCurrent,
    },
    project: activeProject,
    onMoveClip: useVideoEditorStore.getState().moveClip,
    onReady: (value) => {
      beginClipInteraction = value;
    },
    onTrimClipEnd: useVideoEditorStore.getState().trimClipEnd,
    onTrimClipStart: useVideoEditorStore.getState().trimClipStart,
  });

  act(() => root?.render(<Harness />));
  act(() => beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => {
    dispatchTimelinePointerMove(50, 40);
    window.dispatchEvent(new Event('pointerup'));
  });

  expect({ ...useVideoEditorStore.getState().project, updatedAt: 0 }).toEqual({
    ...activeProject,
    updatedAt: 0,
  });
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(0);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  expect(useVideoEditorStore.getState().projectHistory.future).toHaveLength(1);
});

it('keeps an independent delete shortcut outside an active drag transaction', () => {
  const project = createEmptyVideoProject('Interrupted drag');
  project.clips = [createClip(project.tracks[0]!.id)];
  project.duration = 8;
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectClip(project.clips[0]!.id);
  let activeBeginClipInteraction:
    | ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction']
    | null = null;

  function Harness() {
    const state = useVideoEditorStore();
    const latestStateRef = useRef<PlaybackLatestState>(createPlaybackShortcutState(state));
    const handlersRef = useRef<PlaybackHandlers>(createPlaybackShortcutHandlers(state));
    latestStateRef.current = createPlaybackShortcutState(state);
    handlersRef.current = createPlaybackShortcutHandlers(state);
    usePlaybackShortcuts(latestStateRef, handlersRef, vi.fn());
    const timelineDrag = useProjectTimelineDrag({
      historyTransaction: {
        beginProjectHistoryTransaction: state.beginProjectHistoryTransaction,
        endProjectHistoryTransaction: state.endProjectHistoryTransaction,
        isProjectHistoryTransactionCurrent: state.isProjectHistoryTransactionCurrent,
      },
      pixelsPerSecond: 10,
      project: state.project!,
      onMoveClip: state.moveClip,
      onSelectClip: state.selectClip,
      onSelectTrack: state.selectTrack,
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: state.trimClipEnd,
      onTrimClipStart: state.trimClipStart,
    });
    activeBeginClipInteraction = timelineDrag.beginClipInteraction;
    return null;
  }

  act(() => root?.render(<Harness />));
  const clip = useVideoEditorStore.getState().project!.clips[0]!;
  act(() => activeBeginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => dispatchTimelinePointerMove(120, 40));
  act(() => dispatchDeleteKeyDown());

  expect(useVideoEditorStore.getState().project?.clips).toHaveLength(1);
  expect(useVideoEditorStore.getState().projectHistory.transaction).not.toBeNull();

  act(() => window.dispatchEvent(new Event('pointerup')));
  act(() => dispatchDeleteKeyDown());

  expect(useVideoEditorStore.getState().project?.clips).toHaveLength(0);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(2);
  useVideoEditorStore.getState().undoProject();
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(7);
  useVideoEditorStore.getState().undoProject();
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(5);
});

it('rejects stale pointer movement after same-id project replacement', () => {
  const project = createEmptyVideoProject('Original pointer owner');
  project.clips = [createClip(project.tracks[0]!.id)];
  project.duration = 12;
  useVideoEditorStore.getState().setProject(project);
  let activeBeginClipInteraction:
    | ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction']
    | null = null;

  function Harness() {
    const state = useVideoEditorStore();
    const timelineDrag = useProjectTimelineDrag({
      historyTransaction: {
        beginProjectHistoryTransaction: state.beginProjectHistoryTransaction,
        endProjectHistoryTransaction: state.endProjectHistoryTransaction,
        isProjectHistoryTransactionCurrent: state.isProjectHistoryTransactionCurrent,
      },
      pixelsPerSecond: 10,
      project: state.project!,
      onMoveClip: state.moveClip,
      onSelectClip: state.selectClip,
      onSelectTrack: state.selectTrack,
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd: state.trimClipEnd,
      onTrimClipStart: state.trimClipStart,
    });
    activeBeginClipInteraction = timelineDrag.beginClipInteraction;
    return null;
  }

  act(() => root?.render(<Harness />));
  const clip = useVideoEditorStore.getState().project!.clips[0]!;
  act(() => activeBeginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => dispatchTimelinePointerMove(120, 40));

  const replacement = createEmptyVideoProject('Accepted replacement');
  replacement.id = project.id;
  replacement.duration = 12;
  replacement.clips = [createClip(replacement.tracks[0]!.id)];
  act(() => useVideoEditorStore.getState().setProject(replacement));
  act(() => dispatchTimelinePointerMove(180, 40));

  expect(useVideoEditorStore.getState().project?.name).toBe('Accepted replacement');
  expect(useVideoEditorStore.getState().project?.clips[0]?.startTime).toBe(5);
  expect(useVideoEditorStore.getState().projectHistory.past).toEqual([]);
  expect(useVideoEditorStore.getState().projectHistory.transaction).toBeNull();
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

it('maps vertical movement to the physical track and its base lane', () => {
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

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 8, project.tracks[1]!.id, 'line-1');
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
