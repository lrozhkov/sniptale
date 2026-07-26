// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';

const highlighterMocks = vi.hoisted(() => ({
  isHighlighterEnabled: vi.fn(() => true),
  isHighlighterPausedState: vi.fn(() => false),
}));

vi.mock('../../highlighter', async () => {
  const actual = await vi.importActual<typeof import('../../highlighter')>('../../highlighter');
  return {
    ...actual,
    isHighlighterEnabled: highlighterMocks.isHighlighterEnabled,
    isHighlighterPausedState: highlighterMocks.isHighlighterPausedState,
  };
});

import { createThrottledMouseMoveHandler, processFrameHover } from './helpers';

function createFrame(): FrameData {
  return { effectMode: 'border', height: 120, id: 'frame-1', width: 200, x: 100, y: 100 };
}

function processHover(args: {
  x: number;
  y: number;
  hoveredFrameId?: string | null;
  isDrawing?: boolean;
}) {
  const actions = {
    clearHoverFrame: vi.fn(),
    hoverFrame: vi.fn(),
    scheduleHoverFrameHide: vi.fn(),
    setResizeFrame: vi.fn(),
  };
  processFrameHover({
    directControl: null,
    frames: [createFrame()],
    hoveredFrameId: args.hoveredFrameId ?? null,
    isDrawing: args.isDrawing ?? false,
    selectedFrameId: null,
    ...actions,
    x: args.x,
    y: args.y,
  });
  return actions;
}

beforeEach(() => {
  highlighterMocks.isHighlighterEnabled.mockReturnValue(true);
  highlighterMocks.isHighlighterPausedState.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('processFrameHover', () => {
  it('shows only the border winner trigger and resize handles', () => {
    const actions = processHover({ x: 300, y: 160 });

    expect(actions.hoverFrame).toHaveBeenCalledWith('frame-1');
    expect(actions.setResizeFrame).toHaveBeenCalledWith('frame-1');
  });

  it('does not activate a frame from its interior', () => {
    const actions = processHover({ x: 200, y: 160, hoveredFrameId: 'frame-1' });

    expect(actions.hoverFrame).not.toHaveBeenCalled();
    expect(actions.setResizeFrame).toHaveBeenCalledWith(null);
    expect(actions.scheduleHoverFrameHide).toHaveBeenCalledWith('frame-1');
  });

  it('suppresses every other frame control while free drawing is active', () => {
    const actions = processHover({ x: 100, y: 160, hoveredFrameId: 'frame-1', isDrawing: true });

    expect(actions.clearHoverFrame).toHaveBeenCalledOnce();
    expect(actions.setResizeFrame).toHaveBeenCalledWith(null);
    expect(actions.hoverFrame).not.toHaveBeenCalled();
  });

  it('tracks resize proximity in standard cursor mode without showing a trigger', () => {
    highlighterMocks.isHighlighterEnabled.mockReturnValue(false);
    const actions = processHover({ x: 300, y: 160 });

    expect(actions.setResizeFrame).toHaveBeenCalledWith('frame-1');
    expect(actions.hoverFrame).not.toHaveBeenCalled();
    expect(actions.clearHoverFrame).toHaveBeenCalledOnce();
  });

  it('keeps the proximity mouse tracker active in standard cursor mode', () => {
    highlighterMocks.isHighlighterEnabled.mockReturnValue(false);
    const handleMouseMove = vi.fn();
    let scheduled: FrameRequestCallback | undefined;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        scheduled = callback;
        return 1;
      })
    );
    const handler = createThrottledMouseMoveHandler({
      clearResizeFrame: vi.fn(),
      handleMouseMove,
      lastMouseX: { current: -1 },
      lastMouseY: { current: -1 },
      lastProcessTime: { current: 0 },
      rafId: { current: null },
    });
    const event = new MouseEvent('mousemove', { clientX: 300, clientY: 160 });

    handler(event);
    scheduled?.(0);

    expect(handleMouseMove).toHaveBeenCalledWith(event, undefined);
  });

  it.each([
    'sniptale-toolbar-portal-wrapper',
    'sniptale-popover-menu',
    'sniptale-callout-settings-popover',
    'sniptale-step-badge-popover',
  ])('cancels pending frame hit-testing while the pointer is over %s', (className) => {
    const clearResizeFrame = vi.fn();
    const handleMouseMove = vi.fn();
    const rafId = { current: 12 as number | null };
    const toolbar = document.createElement('div');
    toolbar.className = className;
    const event = new MouseEvent('mousemove', { clientX: 300, clientY: 160 });
    Object.defineProperty(event, 'composedPath', { value: () => [toolbar, document.body] });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const handler = createThrottledMouseMoveHandler({
      clearResizeFrame,
      handleMouseMove,
      lastMouseX: { current: -1 },
      lastMouseY: { current: -1 },
      lastProcessTime: { current: 0 },
      rafId,
    });

    handler(event);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(12);
    expect(rafId.current).toBeNull();
    expect(clearResizeFrame).toHaveBeenCalledOnce();
    expect(handleMouseMove).not.toHaveBeenCalled();
  });

  it('clears frame proximity over the main content toolbar', () => {
    const clearResizeFrame = vi.fn();
    const handleMouseMove = vi.fn();
    const toolbar = document.createElement('div');
    toolbar.dataset['ui'] = 'content.toolbar.root';
    const event = new MouseEvent('mousemove');
    Object.defineProperty(event, 'composedPath', { value: () => [toolbar, document.body] });
    const handler = createThrottledMouseMoveHandler({
      clearResizeFrame,
      handleMouseMove,
      lastMouseX: { current: -1 },
      lastMouseY: { current: -1 },
      lastProcessTime: { current: 0 },
      rafId: { current: null },
    });

    handler(event);

    expect(clearResizeFrame).toHaveBeenCalledOnce();
    expect(handleMouseMove).not.toHaveBeenCalled();
  });

  it('keeps resize proximity active while the pointer enters its own handle', () => {
    const clearResizeFrame = vi.fn();
    const handleMouseMove = vi.fn();
    const handle = document.createElement('div');
    handle.className = 'sniptale-resize-handle';
    handle.dataset['frameId'] = 'frame-1';
    handle.dataset['frameControl'] = 'resize-handle';
    const event = new MouseEvent('mousemove');
    Object.defineProperty(event, 'composedPath', { value: () => [handle, document.body] });
    const handler = createThrottledMouseMoveHandler({
      clearResizeFrame,
      handleMouseMove,
      lastMouseX: { current: -1 },
      lastMouseY: { current: -1 },
      lastProcessTime: { current: 0 },
      rafId: { current: null },
    });

    handler(event);

    expect(clearResizeFrame).not.toHaveBeenCalled();
    expect(handleMouseMove).not.toHaveBeenCalled();
  });
});
