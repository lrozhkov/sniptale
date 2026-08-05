// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCalloutSettingsFixture,
  createFrameDataFixture,
} from '../../frame-runtime/test-support';

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
import type {
  FrameData,
  FrameState,
  ResizeDirection,
} from '../../../../features/highlighter/contracts';
import { useFrameUIStore } from '../../frame-runtime/state/frame-ui.store';
import { MIN_FRAME_SIZE } from '../layout/portal';

function createFixture(overrides: Partial<FrameData> = {}) {
  const frame = createFrameDataFixture('frame-1', {
    x: 20,
    y: 30,
    width: 100,
    height: 80,
    ...overrides,
  });
  const container = document.createElement('div');
  container.style.left = `${frame.x}px`;
  container.style.top = `${frame.y}px`;
  container.style.width = `${frame.width}px`;
  container.style.height = `${frame.height}px`;
  const visibleFrame = document.createElement('div');
  visibleFrame.className = 'sniptale-interactive-frame';
  visibleFrame.style.width = `${frame.width}px`;
  visibleFrame.style.height = `${frame.height}px`;
  container.appendChild(visibleFrame);
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
  return { container, frame, listenerConfig, onUpdate, refs, setState, start, visibleFrame };
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
  document.querySelectorAll('.sniptale-callout').forEach((element) => element.remove());
  useFrameUIStore.getState().reset();
  vi.unstubAllGlobals();
});

function mountCallout(
  frameId: string,
  rect: { left: number; top: number; width: number; height: number }
) {
  const callout = document.createElement('div');
  callout.className = 'sniptale-callout';
  callout.dataset['frameId'] = frameId;
  callout.getBoundingClientRect = vi.fn(() => ({
    ...rect,
    bottom: rect.top + rect.height,
    right: rect.left + rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }));
  document.body.appendChild(callout);
}

function flushRaf(id = 1) {
  const callback = rafCallbacks.get(id);
  rafCallbacks.delete(id);
  callback?.(16);
}

describe('transient frame resize', () => {
  it('keeps the linked callout and its manual connector waypoint fixed while resizing', () => {
    const callout = createCalloutSettingsFixture();
    callout.placement = {
      ...callout.placement,
      manualPlacement: { centerOffsetX: 130, centerOffsetY: -10 },
      connectorAttachments: {
        ...callout.placement.connectorAttachments!,
        frame: { mode: 'free', perimeterPosition: 50 / 360 },
      },
      connectorFramePosition: 50 / 360,
      connectorWaypoint: { centerOffsetX: 30, centerOffsetY: -20 },
    };
    callout.style.connector.kind = 'line';
    const fixture = createFixture({ callout });
    mountCallout(fixture.frame.id, { left: 160, top: 20, width: 80, height: 60 });
    fixture.start(reactPointer(100, 100), 'e');

    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(140, 100));
    flushRaf();

    const resized = fixture.refs.tempFrameRef.current;
    const resizedCenter = {
      x: resized.x + resized.width / 2,
      y: resized.y + resized.height / 2,
    };
    expect(resized.callout?.placement.manualPlacement).toEqual({
      centerOffsetX: 200 - resizedCenter.x,
      centerOffsetY: 50 - resizedCenter.y,
    });
    expect(resized.callout?.placement.connectorWaypoint).toEqual({
      centerOffsetX: 100 - resizedCenter.x,
      centerOffsetY: 50 - resizedCenter.y,
    });
    expect(resized.callout?.placement.connectorFramePosition).toBeCloseTo(50 / 440);
    expect(resized.callout?.placement.connectorAttachments?.frame.perimeterPosition).toBeCloseTo(
      50 / 440
    );
    expect(resized.callout?.style).toEqual(callout.style);
  });

  it.each([
    ['n', { x: 20, y: 40, width: 100, height: 70 }],
    ['ne', { x: 20, y: 40, width: 115, height: 70 }],
    ['e', { x: 20, y: 30, width: 115, height: 80 }],
    ['se', { x: 20, y: 30, width: 115, height: 90 }],
    ['s', { x: 20, y: 30, width: 100, height: 90 }],
    ['sw', { x: 35, y: 30, width: 85, height: 90 }],
    ['w', { x: 35, y: 30, width: 85, height: 80 }],
    ['nw', { x: 35, y: 40, width: 85, height: 70 }],
  ] as const)('keeps canonical live geometry for %s resize', (direction, expected) => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), direction);
    createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(115, 110));

    flushRaf();

    expect(fixture.refs.tempFrameRef.current).toMatchObject(expected);
    expect(fixture.container.style.left).toBe(`${expected.x}px`);
    expect(fixture.container.style.top).toBe(`${expected.y}px`);
    expect(fixture.container.style.width).toBe(`${expected.width}px`);
    expect(fixture.container.style.height).toBe(`${expected.height}px`);
    expect(fixture.visibleFrame.style.width).toBe(`${expected.width}px`);
    expect(fixture.visibleFrame.style.height).toBe(`${expected.height}px`);
  });

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

  it.each([
    {
      direction: 'w' as const,
      move: { x: 80, y: 100 },
      expectedFrameSize: '120px',
      oppositeEdge: (container: HTMLDivElement, visibleFrame: HTMLDivElement) =>
        Number.parseFloat(container.style.left) + Number.parseFloat(visibleFrame.style.width),
      expectedOppositeEdge: 120,
    },
    {
      direction: 'n' as const,
      move: { x: 100, y: 80 },
      expectedFrameSize: '100px',
      oppositeEdge: (container: HTMLDivElement, visibleFrame: HTMLDivElement) =>
        Number.parseFloat(container.style.top) + Number.parseFloat(visibleFrame.style.height),
      expectedOppositeEdge: 110,
    },
  ])(
    'keeps the visible opposite edge fixed during live $direction resize',
    ({ direction, expectedFrameSize, expectedOppositeEdge, move, oppositeEdge }) => {
      const fixture = createFixture();
      fixture.start(reactPointer(100, 100), direction);
      createInteractiveFramePointerMoveHandler(fixture.listenerConfig)(domPointer(move.x, move.y));

      flushRaf();

      const size =
        direction === 'w' ? fixture.visibleFrame.style.width : fixture.visibleFrame.style.height;
      expect(size).toBe(expectedFrameSize);
      expect(oppositeEdge(fixture.container, fixture.visibleFrame)).toBe(expectedOppositeEdge);
    }
  );

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
    expect(fixture.refs.isResizingRef.current).toBe(false);
    expect(fixture.listenerConfig.stateRef.current).toBe('resizing');
    expect(highlighter.resumeHighlighter).toHaveBeenCalledOnce();
  });

  it('returns to hover immediately when pointerup commits unchanged geometry', () => {
    const fixture = createFixture();
    fixture.start(reactPointer(100, 100), 'se');

    createInteractiveFramePointerUpHandler(fixture.listenerConfig)(domPointer(100, 100));

    expect(fixture.onUpdate).toHaveBeenCalledOnce();
    expect(fixture.listenerConfig.stateRef.current).toBe('hover');
    expect(fixture.setState).toHaveBeenLastCalledWith('hover');
  });

  it('returns to hover when a resize is saturated at the minimum size', () => {
    const fixture = createFixture({ width: MIN_FRAME_SIZE });
    fixture.start(reactPointer(100, 100), 'e');

    createInteractiveFramePointerUpHandler(fixture.listenerConfig)(domPointer(40, 100));

    expect(fixture.refs.tempFrameRef.current.width).toBe(MIN_FRAME_SIZE);
    expect(fixture.onUpdate).toHaveBeenCalledOnce();
    expect(fixture.listenerConfig.stateRef.current).toBe('hover');
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
