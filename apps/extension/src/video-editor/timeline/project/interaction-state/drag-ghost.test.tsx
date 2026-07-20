// @vitest-environment jsdom

import type React from 'react';
import { act, useState } from 'react';
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

it('keeps the drag ghost visible across parent rerenders during a move', () => {
  const project = createEmptyVideoProject('Rerender');
  const clip = createClip(project.tracks[0]!.id);
  project.clips = [clip];
  const onMoveClip =
    vi.fn<
      (clipId: string, startTime: number, trackId?: string, timelineLaneId?: string | null) => void
    >();

  function StatefulHarness() {
    const [revision, setRevision] = useState(0);
    const timelineDrag = useProjectTimelineDrag({
      pixelsPerSecond: 10,
      project,
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

  expect(onMoveClip).toHaveBeenCalledWith('clip-1', 10, project.tracks[0]!.id, 'line-1');
  expect(container?.firstElementChild?.getAttribute('data-revision')).toBe('1');
  expect(container?.firstElementChild?.getAttribute('data-ghost-lane')).toBe('line-1');
});
