// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const targetResolver = vi.hoisted(() => ({ resolvePagePreparationTarget: vi.fn() }));
const targetPolicy = vi.hoisted(() => ({
  hasBlockingHighlighterPopover: vi.fn(() => false),
  isHighlighterExtensionUiElement: vi.fn(() => false),
  isNearExistingFrameBorder: vi.fn(() => false),
}));

vi.mock('../../parser/page-preparation/target', () => targetResolver);
vi.mock('./targets', () => targetPolicy);

import { createHoverInteractionHandlers } from './interactions';
import { createHoverSession } from './session';

function createFixture(enabled = true) {
  const session = createHoverSession();
  const hideHoverOverlay = vi.fn();
  const showHoverOverlay = vi.fn();
  const handlers = createHoverInteractionHandlers({
    getCallbacks: () => ({ addFrame: vi.fn(), hasFrameForElement: () => false }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => enabled,
      isPaused: () => false,
    },
    hoverThrottleMs: 100,
    overlayActions: { hideHoverOverlay, showHoverOverlay },
    session,
  });
  return { handlers, hideHoverOverlay, session, showHoverOverlay };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('highlighter hover mouse lifecycle', () => {
  it('skips movement while mode is disabled', () => {
    const { handlers } = createFixture(false);

    handlers.handleMouseMove(new MouseEvent('mousemove', { clientX: 10, clientY: 12 }));

    expect(targetResolver.resolvePagePreparationTarget).not.toHaveBeenCalled();
  });

  it('consumes the first movement after a frozen click without scheduling', () => {
    const { handlers, hideHoverOverlay, session } = createFixture();
    session.isHoverPreviewFrozen = true;

    handlers.handleMouseMove(new MouseEvent('mousemove', { clientX: 10, clientY: 12 }));

    expect(session.isHoverPreviewFrozen).toBe(false);
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
    expect(targetResolver.resolvePagePreparationTarget).not.toHaveBeenCalled();
  });

  it('schedules and displays an eligible target', () => {
    const { handlers, session, showHoverOverlay } = createFixture();
    const target = document.createElement('div');
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(target);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 9;
    });

    handlers.handleMouseMove(new MouseEvent('mousemove', { clientX: 10, clientY: 12 }));

    expect(showHoverOverlay).toHaveBeenCalledWith(target);
    expect(session.lastHoverTarget).toBe(target);
  });

  it('clears pending hover work without resolving the page below an open settings popover', () => {
    const { handlers, hideHoverOverlay, session } = createFixture();
    session.hoverRafId = 42;
    session.lastHoverTarget = document.createElement('div');
    targetPolicy.hasBlockingHighlighterPopover.mockReturnValue(true);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    handlers.handleMouseMove(new MouseEvent('mousemove', { clientX: 10, clientY: 12 }));

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(session.hoverRafId).toBeNull();
    expect(session.lastHoverTarget).toBeNull();
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
    expect(targetResolver.resolvePagePreparationTarget).not.toHaveBeenCalled();
  });

  it('cancels pending work and clears the target on mouse leave', () => {
    const { handlers, hideHoverOverlay, session } = createFixture();
    session.hoverRafId = 42;
    session.lastHoverTarget = document.createElement('div');
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    handlers.handleMouseLeave();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(session.hoverRafId).toBeNull();
    expect(session.lastHoverTarget).toBeNull();
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
  });

  it('keeps hover state untouched on mouse leave while disabled', () => {
    const { handlers, hideHoverOverlay, session } = createFixture(false);
    session.lastHoverTarget = document.createElement('div');

    handlers.handleMouseLeave();

    expect(session.lastHoverTarget).not.toBeNull();
    expect(hideHoverOverlay).not.toHaveBeenCalled();
  });

  it('cancels pending work and clears disposable tracking state on maintenance', () => {
    const { handlers, session } = createFixture();
    session.hoverRafId = 42;
    session.lastHoverTarget = document.createElement('div');
    session.lastHoverX = 10;
    session.lastHoverY = 12;
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    handlers.cancelPendingHoverFrame();
    handlers.clearHoverTracking();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(session).toMatchObject({
      hoverRafId: null,
      lastHoverTarget: null,
      lastHoverX: -1,
      lastHoverY: -1,
    });
  });
});
