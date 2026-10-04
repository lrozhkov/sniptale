// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';
import { createSelectionModeRuntimeSetup } from '.';

function createSetupFixture() {
  const session = createSelectionModeSession();
  const order: string[] = [];
  const handlers = {
    handleClick: vi.fn(),
    handleDragStart: vi.fn(),
    handleKeyDown: vi.fn(),
    handleMouseDown: vi.fn(),
    handleMouseLeave: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  };
  const runtime = createSelectionModeRuntimeSetup({
    createDragFrame: vi.fn(),
    createFinalElements: vi.fn(() => order.push('create')),
    getMaxSelectionHeight: vi.fn(() => 800),
    getMaxSelectionWidth: vi.fn(() => 1200),
    flushFinalFrameUpdate: vi.fn(),
    ...handlers,
    minSelectionSize: 32,
    scheduleFinalFrameUpdate: vi.fn(),
    session,
    updateFinalFrame: vi.fn(() => {
      order.push(`update:${session.currentState}`);
    }),
    zIndexBase: 500,
  });

  return { handlers, order, runtime, session };
}

describe('selection-mode runtime setup', () => {
  it('exposes the exact session identity and listener bindings', () => {
    const { handlers, runtime, session } = createSetupFixture();

    expect(runtime.state).toBe(session);
    expect(runtime.setupListenerHandlers).toEqual(handlers);

    session.currentSelection = { x: 1, y: 2, width: 3, height: 4 };
    expect(runtime.state.currentSelection).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    runtime.state.isDragging = true;
    expect(session.isDragging).toBe(true);
  });

  it('creates final elements before confirming state and updating the frame', () => {
    const { order, runtime, session } = createSetupFixture();
    session.currentState = 'drag';

    runtime.showFinalFrame();

    expect(order).toEqual(['create', 'update:confirmed']);
    expect(session.currentState).toBe('confirmed');
  });
});

it('uses immutable frozen bounds for selection and returns to live measurements without a frame', () => {
  const { runtime, session } = createSetupFixture();
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 400, 20, 30));
  expect(runtime.getAbsolutePosition(element)).toEqual({ x: 300, y: 400, width: 20, height: 30 });
  session.frozenFrame = {
    dataUrl: 'data:image/png;base64,frame',
    geometry: {
      width: 1200,
      height: 800,
      scale: 1,
      getRect: () => ({ x: 10, y: 20, width: 100, height: 80 }),
      targetAt: () => element,
      assertViewport: vi.fn(),
    },
  };
  expect(runtime.getAbsolutePosition(element)).toEqual({ x: 10, y: 20, width: 100, height: 80 });
  session.frozenFrame = null;
  expect(runtime.getAbsolutePosition(element).x).toBe(300);
});
