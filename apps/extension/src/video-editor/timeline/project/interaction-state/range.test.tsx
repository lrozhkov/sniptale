// @vitest-environment jsdom

import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useProjectTimelineRangeSelection } from './range';

interface RangeHarnessState {
  beginRangeSelection: (event: React.PointerEvent<HTMLDivElement>) => void;
  createSurfaceRangeSelectionStartHandler: (
    onSimpleClick: (time: number) => void
  ) => (event: React.PointerEvent<HTMLDivElement>) => void;
  playbackRange: { end: number; start: number } | null;
  timelineRef: React.RefObject<HTMLDivElement | null>;
}

function renderRangeHarness(
  root: Root | null,
  onState: (state: RangeHarnessState) => void,
  handlers: {
    onSeek: (time: number) => void;
    onSetPlaybackRange: (range: { end: number; start: number } | null) => void;
  }
) {
  const Harness = () => {
    const timelineRef = React.useRef<HTMLDivElement | null>(null);
    const range = useProjectTimelineRangeSelection({
      pixelsPerSecond: 60,
      playbackRange: null,
      projectDuration: 10,
      timelineRef,
      onSeek: handlers.onSeek,
      onSetPlaybackRange: handlers.onSetPlaybackRange,
    });

    onState({
      beginRangeSelection: range.beginRangeSelection,
      createSurfaceRangeSelectionStartHandler: range.createSurfaceRangeSelectionStartHandler,
      playbackRange: range.visiblePlaybackRange,
      timelineRef,
    });

    return <div ref={timelineRef} onPointerDown={range.beginRangeSelection} />;
  };

  act(() => {
    root?.render(<Harness />);
  });
}

function dispatchPointerEvent(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'clientX', { value: clientX });
  target.dispatchEvent(event);
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let harnessState: RangeHarnessState | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  harnessState = null;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  harnessState = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('creates a loop playback range from ruler drag selection', () => {
  const onSeek = vi.fn();
  const onSetPlaybackRange = vi.fn();
  renderRangeHarness(
    root,
    (state) => {
      harnessState = state;
    },
    { onSeek, onSetPlaybackRange }
  );
  vi.spyOn(harnessState!.timelineRef.current!, 'getBoundingClientRect').mockReturnValue({
    bottom: 30,
    height: 30,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  act(() => {
    dispatchPointerEvent(harnessState!.timelineRef.current!, 'pointerdown', 120);
    dispatchPointerEvent(window, 'pointermove', 240);
    dispatchPointerEvent(window, 'pointerup', 240);
  });

  expect(onSetPlaybackRange).toHaveBeenCalledWith({ start: 2, end: 4 });
  expect(onSeek).toHaveBeenCalledWith(2);
});

it('treats a ruler click without drag as a plain seek', () => {
  const onSeek = vi.fn();
  const onSetPlaybackRange = vi.fn();
  renderRangeHarness(
    root,
    (state) => {
      harnessState = state;
    },
    { onSeek, onSetPlaybackRange }
  );
  vi.spyOn(harnessState!.timelineRef.current!, 'getBoundingClientRect').mockReturnValue({
    bottom: 30,
    height: 30,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  act(() => {
    dispatchPointerEvent(harnessState!.timelineRef.current!, 'pointerdown', 90);
    dispatchPointerEvent(window, 'pointerup', 90);
  });

  expect(onSetPlaybackRange).not.toHaveBeenCalled();
  expect(onSeek).toHaveBeenCalledWith(1.5);
});

it('supports surface-owned simple click handlers for empty lane interactions', () => {
  const onSeek = vi.fn();
  const onSetPlaybackRange = vi.fn();
  const onTrackSimpleClick = vi.fn();

  renderRangeHarness(
    root,
    (state) => {
      harnessState = state;
    },
    { onSeek, onSetPlaybackRange }
  );
  vi.spyOn(harnessState!.timelineRef.current!, 'getBoundingClientRect').mockReturnValue({
    bottom: 30,
    height: 30,
    left: 0,
    right: 600,
    top: 0,
    width: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  const beginTrackRangeSelection =
    harnessState!.createSurfaceRangeSelectionStartHandler(onTrackSimpleClick);

  act(() => {
    beginTrackRangeSelection({
      clientX: 180,
      currentTarget: harnessState!.timelineRef.current,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: harnessState!.timelineRef.current,
    } as unknown as React.PointerEvent<HTMLDivElement>);
    dispatchPointerEvent(window, 'pointerup', 180);
  });

  expect(onSetPlaybackRange).not.toHaveBeenCalled();
  expect(onTrackSimpleClick).toHaveBeenCalledWith(3);
  expect(onSeek).not.toHaveBeenCalled();
});
