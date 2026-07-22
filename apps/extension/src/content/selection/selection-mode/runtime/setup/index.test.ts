// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createSelectionModeSession } from '../../session';
import { createSelectionModeRuntimeSetup } from '.';

function createSetupFixture() {
  const session = createSelectionModeSession();
  const order: string[] = [];
  const handlers = {
    handleClick: vi.fn(),
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
    ...handlers,
    minSelectionSize: 32,
    session,
    setCleanupEventListeners: (cleanup) => {
      session.cleanupEventListeners = cleanup;
    },
    setCleanupScrollListeners: (cleanup) => {
      session.cleanupScrollListeners = cleanup;
    },
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
    const eventCleanup = vi.fn();
    const scrollCleanup = vi.fn();

    expect(runtime.state).toBe(session);
    expect(runtime.setupListenerHandlers).toEqual(handlers);

    runtime.setCleanupEventListeners(eventCleanup);
    runtime.setCleanupScrollListeners(scrollCleanup);
    expect(session.cleanupEventListeners).toBe(eventCleanup);
    expect(session.cleanupScrollListeners).toBe(scrollCleanup);

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
