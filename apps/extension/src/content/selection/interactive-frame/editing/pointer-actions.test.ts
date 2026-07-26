// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../../frame-runtime/test-support';

const highlighter = vi.hoisted(() => ({ pauseHighlighter: vi.fn(), resumeHighlighter: vi.fn() }));
vi.mock('../../highlighter', () => highlighter);

import {
  createInteractiveFramePointerAbortHandler,
  createInteractiveFramePointerCancelHandler,
  createInteractiveFramePointerMoveHandler,
  createInteractiveFramePointerUpHandler,
  createInteractiveFrameResizeStartHandler,
  type InteractiveFramePointerMoveEvent,
  type InteractiveFramePointerStartEvent,
} from './pointer-actions';
import type { InteractiveFrameListenerConfig } from '../controller/types';
import type { FrameState, ResizeDirection } from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';

function createFixture() {
  const frame = createFrameDataFixture('frame-1', { x: 20, y: 30, width: 100, height: 80 });
  const container = document.createElement('div');
  const stateRef: { current: FrameState } = { current: 'hover' };
  const refs = {
    isDraggingRef: { current: false },
    isResizingRef: { current: false },
    resizeDirectionRef: { current: null as ResizeDirection | null },
    resizeOriginStateRef: {
      current: 'idle' as FrameState,
    },
    resizeRafIdRef: { current: null as number | null },
    latestResizeSampleRef: {
      current: null as { clientX: number; clientY: number; pointerId: number } | null,
    },
    pointerIdRef: { current: null as number | null },
    startXRef: { current: 0 },
    startYRef: { current: 0 },
    startFrameRef: { current: frame },
    tempFrameRef: { current: frame },
    effectModeRef: { current: 'border' as const },
  };
  const setState = vi.fn((state) => {
    stateRef.current = state;
  });
  const setTempFrame = vi.fn((next) => {
    if (typeof next !== 'function') refs.tempFrameRef.current = next;
  });
  const onUpdate = vi.fn();
  const listenerConfig: InteractiveFrameListenerConfig = {
    ...refs,
    containerRef: { current: container },
    frameId: frame.id,
    onUpdate,
    setState,
    setTempFrame,
    stateRef,
  };
  const start = createInteractiveFrameResizeStartHandler({
    frameId: 'frame-1',
    ...refs,
    setState,
    setTempFrame,
    state: 'hover',
    stateRef,
  });
  return { frame, listenerConfig, onUpdate, refs, setState, start };
}

function reactPointer(x: number, y: number): InteractiveFramePointerStartEvent {
  return {
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 7,
    currentTarget: { setPointerCapture: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    nativeEvent: { stopImmediatePropagation: vi.fn() },
    target: document.createElement('div'),
  };
}

function domPointer(x: number, y: number): InteractiveFramePointerMoveEvent {
  return {
    clientX: x,
    clientY: y,
    pointerId: 7,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

let nextRafId = 1;
const rafCallbacks = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  vi.clearAllMocks();
  useFrameUIStore.getState().reset();
  nextRafId = 1;
  rafCallbacks.clear();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = nextRafId;
      nextRafId += 1;
      rafCallbacks.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      rafCallbacks.delete(id);
    })
  );
});

afterEach(() => {
  useFrameUIStore.getState().reset();
  vi.unstubAllGlobals();
});

function flushRaf(id = 1) {
  const callback = rafCallbacks.get(id);
  rafCallbacks.delete(id);
  callback?.(16);
}

describe('transient frame resize', () => {
  it('does not open the frame toolbar from a resize-handle pointerdown', () => {
    const fixture = createFixture();

    fixture.start(reactPointer(100, 100), 'se');

    expect(useFrameUIStore.getState().selectedFrameId).toBeNull();
  });

  it('coalesces live resize samples into one update per animation frame', () => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), 'se');
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(125, 115));
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(140, 130));

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(fixture.refs.tempFrameRef.current).toMatchObject({ width: 100, height: 80 });

    flushRaf();

    expect(fixture.refs.tempFrameRef.current).toMatchObject({ width: 140, height: 110 });
  });

  it('flushes the final pointer sample and commits exactly once on pointerup', () => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), 'se');
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(125, 115));
    createInteractiveFramePointerUpHandler(fixture.listenerConfig)(domPointer(140, 130));

    expect(highlighter.pauseHighlighter).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(fixture.refs.tempFrameRef.current).toMatchObject({ width: 140, height: 110 });
    expect(fixture.onUpdate).toHaveBeenCalledOnce();
    expect(fixture.onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ width: 140, height: 110 })
    );
    expect(highlighter.resumeHighlighter).toHaveBeenCalledOnce();
  });

  it('restores the starting geometry without a history update on cancel', () => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), 'se');
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(140, 140));
    expect(createInteractiveFramePointerCancelHandler(fixture.listenerConfig)()).toBe(true);

    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(fixture.refs.tempFrameRef.current).toMatchObject({ width: 100, height: 80 });
    expect(fixture.onUpdate).not.toHaveBeenCalled();
    expect(highlighter.resumeHighlighter).toHaveBeenCalledOnce();
  });

  it('abandons stale resize geometry when an external owner resets the frame', () => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), 'se');
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(140, 140));
    flushRaf();

    expect(createInteractiveFramePointerAbortHandler(fixture.listenerConfig)()).toBe(true);
    createInteractiveFramePointerUpHandler(fixture.listenerConfig)(domPointer(150, 150));

    expect(fixture.refs.isResizingRef.current).toBe(false);
    expect(fixture.refs.pointerIdRef.current).toBeNull();
    expect(fixture.onUpdate).not.toHaveBeenCalled();
    expect(highlighter.resumeHighlighter).toHaveBeenCalledOnce();
  });
});
