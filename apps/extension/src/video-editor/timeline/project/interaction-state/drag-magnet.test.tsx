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
  type VideoProject,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import type { VideoEditorProjectHistoryTransactionActions } from '../../../contracts/commands/history';
import { useVideoEditorStore } from '../../../state/store';
import { useProjectTimelineDrag } from './drag';

const HISTORY_LEASE = Symbol('magnetic-drag');

function createClip(trackId: string, id = 'clip-1', startTime = 5): VideoProjectVideoClip {
  return {
    id,
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: id,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 3,
  };
}

function pointerStart(clientX = 100): React.PointerEvent {
  return {
    clientX,
    clientY: 40,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent;
}

function pointerMove(clientX: number, altKey = false) {
  const event = new Event('pointermove');
  Object.defineProperties(event, {
    altKey: { value: altKey },
    clientX: { value: clientX },
    clientY: { value: 40 },
  });
  window.dispatchEvent(event);
}

function createHistory() {
  return {
    beginProjectHistoryTransaction: vi.fn(() => HISTORY_LEASE),
    endProjectHistoryTransaction: vi.fn(),
    isProjectHistoryTransactionCurrent: (lease: symbol) => lease === HISTORY_LEASE,
  };
}

function createHarness(options: {
  currentTime?: number;
  history?: VideoEditorProjectHistoryTransactionActions;
  magnetEnabled?: boolean;
  onMoveClip?: Parameters<typeof useProjectTimelineDrag>[0]['onMoveClip'];
  onTrimClipEnd?: Parameters<typeof useProjectTimelineDrag>[0]['onTrimClipEnd'];
  onTrimClipStart?: Parameters<typeof useProjectTimelineDrag>[0]['onTrimClipStart'];
  project: VideoProject;
}) {
  let begin: ReturnType<typeof useProjectTimelineDrag>['beginClipInteraction'] | null = null;
  const ghosts: Array<ReturnType<typeof useProjectTimelineDrag>['dragGhost']> = [];
  const guides: Array<number | null> = [];
  const history = options.history ?? createHistory();
  const onMoveClip = options.onMoveClip ?? vi.fn();
  const onTrimClipEnd = options.onTrimClipEnd ?? vi.fn();
  const onTrimClipStart = options.onTrimClipStart ?? vi.fn();
  function Harness(props: { currentTime: number }) {
    const drag = useProjectTimelineDrag({
      currentTime: props.currentTime,
      historyTransaction: history,
      magnetEnabled: options.magnetEnabled ?? true,
      pixelsPerSecond: 10,
      project: options.project,
      onMoveClip,
      onSelectClip: vi.fn(),
      onSelectTrack: vi.fn(),
      onTimelinePreviewSuspendedChange: vi.fn(),
      onTrimClipEnd,
      onTrimClipStart,
    });
    begin = drag.beginClipInteraction;
    ghosts.push(drag.dragGhost);
    guides.push(drag.snapGuideTime);
    return <div data-snap-guide={drag.snapGuideTime ?? ''} />;
  }
  const render = (currentTime = options.currentTime ?? 0) => {
    act(() => root?.render(<Harness currentTime={currentTime} />));
  };
  return {
    begin: () => begin,
    ghosts,
    guides,
    render,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

it('snaps the nearest moving edge and clears its guide in one history transaction', () => {
  const project = createEmptyVideoProject('Neighbor snap');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip, createClip(project.tracks[0]!.id, 'clip-2', 10)];
  const onMoveClip = vi.fn();
  const history = createHistory();
  const harness = createHarness({ history, onMoveClip, project });
  harness.render();

  act(() => {
    harness.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 7, project.tracks[0]!.id, 'line-1');
  expect(harness.ghosts.at(-1)?.startTime).toBe(7);
  expect(harness.guides.at(-1)).toBe(10);
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(harness.guides.at(-1)).toBeNull();
  expect(history.beginProjectHistoryTransaction).toHaveBeenCalledOnce();
  expect(history.endProjectHistoryTransaction).toHaveBeenCalledOnce();
});

it('uses the live playhead target after the drag has started', () => {
  const project = createEmptyVideoProject('Live playhead');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  const onMoveClip = vi.fn();
  const harness = createHarness({ currentTime: 7, onMoveClip, project });
  harness.render(7);
  act(() => harness.begin()?.(pointerStart(), clip, 'move'));
  harness.render(8);
  act(() => pointerMove(124));

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 8, project.tracks[0]!.id, 'line-1');
});

it('keeps motion regions and the dragged clip own edges out of clip targets', () => {
  const project = createEmptyVideoProject('Clip target policy');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  project.motionRegions = [{ id: 'motion-1', startTime: 6.5, duration: 1 }] as never;
  const onMoveClip = vi.fn();
  const harness = createHarness({ onMoveClip, project });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114);
  });

  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 6.4, project.tracks[0]!.id, 'line-1');
  expect(harness.guides.at(-1)).toBeNull();
});

it('supports disabled Magnet and transient Alt bypass near an eligible edge', () => {
  const project = createEmptyVideoProject('Magnet bypass');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip, createClip(project.tracks[0]!.id, 'clip-2', 10)];
  const disabledMove = vi.fn();
  const disabled = createHarness({ magnetEnabled: false, onMoveClip: disabledMove, project });
  disabled.render();
  act(() => {
    disabled.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114);
    window.dispatchEvent(new Event('pointerup'));
  });
  expect(disabledMove).toHaveBeenLastCalledWith('clip-1', 6.4, project.tracks[0]!.id, 'line-1');

  const altMove = vi.fn();
  const alt = createHarness({ onMoveClip: altMove, project });
  alt.render();
  act(() => {
    alt.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114, true);
  });
  expect(altMove).toHaveBeenLastCalledWith('clip-1', 6.4, project.tracks[0]!.id, 'line-1');
});

it('snaps project bounds plus the actively trimmed start and end edges', () => {
  const project = createEmptyVideoProject('Bounds and trims');
  const clip = createClip(project.tracks[0]!.id);
  project.duration = 12;
  project.clips = [
    clip,
    createClip(project.tracks[0]!.id, 'previous', 1),
    createClip(project.tracks[0]!.id, 'next', 9),
  ];
  const onMoveClip = vi.fn();
  const onTrimClipStart = vi.fn();
  const onTrimClipEnd = vi.fn();
  const harness = createHarness({ onMoveClip, onTrimClipEnd, onTrimClipStart, project });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'move');
    pointerMove(54);
  });
  expect(onMoveClip).toHaveBeenLastCalledWith('clip-1', 0, project.tracks[0]!.id, 'line-1');
  act(() => window.dispatchEvent(new Event('pointerup')));
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'trim-start');
    pointerMove(94);
  });
  expect(onTrimClipStart).toHaveBeenLastCalledWith('clip-1', 4);
  act(() => window.dispatchEvent(new Event('pointerup')));
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'trim-end');
    pointerMove(104);
  });
  expect(onTrimClipEnd).toHaveBeenLastCalledWith('clip-1', 9);
});

it('renders the authoritative applied result instead of an unreachable snap candidate', () => {
  const project = createEmptyVideoProject('Applied result');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip, { ...createClip(project.tracks[0]!.id, 'container', 7), duration: 5 }];
  useVideoEditorStore.getState().setProject(project);
  const activeProject = useVideoEditorStore.getState().project!;
  const harness = createHarness({
    onMoveClip: useVideoEditorStore.getState().moveClip,
    project: activeProject,
  });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), activeProject.clips[0]!, 'move');
    pointerMove(120);
  });

  const persistedStart = useVideoEditorStore.getState().project!.clips[0]!.startTime;
  expect(persistedStart).not.toBe(7);
  expect(harness.ghosts.at(-1)?.startTime).toBe(persistedStart);
  expect(harness.guides.at(-1)).toBeNull();
});

it('hides a trim guide when the mutation owner clamps away from the snap target', () => {
  const project = createEmptyVideoProject('Applied trim result');
  const clip = createClip(project.tracks[0]!.id);
  project.duration = 8;
  project.clips = [clip];
  const onTrimClipStart = vi.fn(() => ({
    clipId: clip.id,
    duration: 0.1,
    endTime: 8,
    startTime: 7.9,
    timelineLaneId: 'line-1',
    trackId: clip.trackId,
  }));
  const harness = createHarness({ onTrimClipStart, project });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'trim-start');
    pointerMove(130);
  });

  expect(onTrimClipStart).toHaveBeenLastCalledWith(clip.id, 8);
  expect(harness.guides.at(-1)).toBeNull();
});

it('keeps the guide when a fractional trim-end result matches the snap target', () => {
  const project = createEmptyVideoProject('Fractional trim result');
  const clip = createClip(project.tracks[0]!.id, 'clip-1', 0.1);
  clip.duration = 42.2;
  clip.sourceDuration = 42.2;
  project.duration = 60;
  project.clips = [clip];
  useVideoEditorStore.getState().setProject(project);
  const activeProject = useVideoEditorStore.getState().project!;
  const harness = createHarness({
    currentTime: 10.2,
    onTrimClipEnd: useVideoEditorStore.getState().trimClipEnd,
    project: activeProject,
  });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), activeProject.clips[0]!, 'trim-end');
    pointerMove(-221);
  });

  const persisted = useVideoEditorStore.getState().project!.clips[0]!;
  expect(persisted.startTime + persisted.duration).toBeCloseTo(10.2);
  expect(harness.guides.at(-1)).toBe(10.2);
});

it('clears an active guide on cancel, replacement, and unmount', () => {
  const project = createEmptyVideoProject('Guide cleanup');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip, createClip(project.tracks[0]!.id, 'clip-2', 10)];
  const harness = createHarness({ project });
  harness.render();
  act(() => {
    harness.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114);
  });
  expect(harness.guides.at(-1)).toBe(10);
  act(() => window.dispatchEvent(new Event('pointercancel')));
  expect(harness.guides.at(-1)).toBeNull();

  act(() => {
    harness.begin()?.(pointerStart(), clip, 'move');
    pointerMove(114);
    harness.begin()?.(pointerStart(), clip, 'move');
  });
  expect(harness.guides.at(-1)).toBeNull();
  act(() => pointerMove(114));
  expect(harness.guides.at(-1)).not.toBeNull();
  expect(container?.querySelector('[data-snap-guide="10"]')).not.toBeNull();
  act(() => root?.unmount());
  expect(container?.querySelector('[data-snap-guide]')).toBeNull();
  root = null;
});
