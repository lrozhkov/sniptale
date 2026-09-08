// @vitest-environment jsdom

import type React from 'react';
import { act, useState, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoTrackKind,
  type VideoProjectClip,
} from '../../../../features/video/project/types';
import { useProjectTimelineDrag } from './drag';

const TEST_HISTORY_LEASE = Symbol('test-history-transaction');

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
    transform: {
      height: 100,
      opacity: 1,
      rotation: 0,
      width: 100,
      x: 0,
      y: 0,
    },
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

it('keeps the draft visible through rerenders and publishes only on release', () => {
  const project = createEmptyVideoProject('Rerender');
  const clip = createClip(project.tracks[0]!.id);
  clip.groupId = 'linked';
  clip.linkMode = VideoClipLinkMode.LINKED;
  const cameraTrack = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(cameraTrack);
  project.clips = [
    clip,
    { ...clip, id: 'camera', trackId: cameraTrack.id, startTime: 6, duration: 1 },
  ];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();

  let rerender: (() => void) | null = null;
  function StatefulHarness() {
    const [revision, setRevision] = useState(0);
    rerender = () => setRevision((current) => current + 1);
    const timelineDrag = useProjectTimelineDrag({
      currentTime: 0,
      historyTransaction: {
        beginProjectHistoryTransaction: () => TEST_HISTORY_LEASE,
        endProjectHistoryTransaction: () => undefined,
        isProjectHistoryTransactionCurrent: (lease) => lease === TEST_HISTORY_LEASE,
      },
      pixelsPerSecond: 10,
      magnetEnabled: false,
      project,
      onSwapClip: vi.fn(),
      onMoveClip: (...args) => {
        onMoveClip(...args);
        setRevision((current) => current + 1);
      },
      onSelectClip: () => undefined,
      onSelectTrack: () => undefined,
      onTimelinePreviewSuspendedChange: () => undefined,
      onTrimClipEnd: vi.fn(),
      onTrimClipStart: vi.fn(),
    });
    beginClipInteraction = timelineDrag.beginClipInteraction;

    return (
      <div
        data-ghost-lane={timelineDrag.dragGhost?.timelineLaneId ?? ''}
        data-revision={revision}
        data-related-count={timelineDrag.dragGhost?.relatedClips?.length ?? 0}
      />
    );
  }

  act(() => {
    root?.render(<StatefulHarness />);
  });
  act(() => {
    beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move');
  });
  act(() => {
    dispatchTimelinePointerMove(150, 40);
  });

  expect(onMoveClip).not.toHaveBeenCalled();
  act(() => rerender?.());
  expect(container?.firstElementChild?.getAttribute('data-revision')).toBe('1');
  expect(container?.firstElementChild?.getAttribute('data-ghost-lane')).toBe('line-1');
  expect(container?.firstElementChild?.getAttribute('data-related-count')).toBe('1');
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(onMoveClip).toHaveBeenCalledOnce();
  expect(onMoveClip).toHaveBeenCalledWith('clip-1', 10, project.tracks[0]!.id, 'line-1');
  expect(container?.firstElementChild?.getAttribute('data-related-count')).toBe('0');
  act(() => beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
  act(() => dispatchTimelinePointerMove(160, 40));
  expect(container?.firstElementChild?.getAttribute('data-related-count')).toBe('1');
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container?.firstElementChild?.getAttribute('data-related-count')).toBe('0');
  act(() => window.dispatchEvent(new Event('pointerup')));
  expect(onMoveClip).toHaveBeenCalledOnce();
});

it.each(['release', 'escape', 'resize', 'leave'] as const)(
  'keeps the reorder proposal disposable through %s and commits the current intent only',
  (ending) => {
    const project = createEmptyVideoProject('Reorder');
    const clip = createClip(project.tracks[0]!.id);
    project.clips = [clip, { ...clip, id: 'neighbor', startTime: 9, duration: 2 }];
    const onSwapClip = vi.fn();
    const onMoveClip = vi.fn();
    function Harness({ resized = false }: { resized?: boolean }) {
      const heights = useMemo(() => ({ [clip.trackId]: resized ? 2 : 1 }), [resized]);
      const drag = useProjectTimelineDrag({
        currentTime: 0,
        historyTransaction: {
          beginProjectHistoryTransaction: () => TEST_HISTORY_LEASE,
          endProjectHistoryTransaction: () => undefined,
          isProjectHistoryTransactionCurrent: (lease) => lease === TEST_HISTORY_LEASE,
        },
        pixelsPerSecond: 20,
        magnetEnabled: false,
        project,
        trackHeightByTrackId: heights,
        onSwapClip,
        onMoveClip,
        onSelectClip: vi.fn(),
        onSelectTrack: vi.fn(),
        onTimelinePreviewSuspendedChange: vi.fn(),
        onTrimClipEnd: vi.fn(),
        onTrimClipStart: vi.fn(),
      });
      beginClipInteraction = drag.beginClipInteraction;
      return (
        <div
          data-reorder={drag.dragGhost?.activeReorder ?? ''}
          data-related-count={drag.dragGhost?.relatedClips?.length ?? 0}
        />
      );
    }
    act(() => root?.render(<Harness />));
    act(() => beginClipInteraction?.(createPointerEvent(100, 40), clip, 'move'));
    act(() => dispatchTimelinePointerMove(160, 40));
    expect(container?.querySelector('[data-reorder="right"]')).not.toBeNull();
    expect(container?.querySelector('[data-related-count="1"]')).not.toBeNull();
    expect(onSwapClip).not.toHaveBeenCalled();
    if (ending === 'escape')
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    if (ending === 'resize') act(() => root?.render(<Harness resized />));
    if (ending === 'leave') act(() => dispatchTimelinePointerMove(240, 40));
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(container?.querySelector('[data-reorder=""]')).not.toBeNull();
    if (ending === 'release') expect(onSwapClip).toHaveBeenCalledExactlyOnceWith(clip.id, 'right');
    else expect(onSwapClip).not.toHaveBeenCalled();
    expect(onMoveClip).toHaveBeenCalledTimes(ending === 'leave' ? 1 : 0);
  }
);
