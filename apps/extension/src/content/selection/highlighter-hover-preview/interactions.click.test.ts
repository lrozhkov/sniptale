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

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function createClickEvent(clientX = 0, clientY = 0): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY });
  vi.spyOn(event, 'preventDefault');
  vi.spyOn(event, 'stopImmediatePropagation');
  vi.spyOn(event, 'stopPropagation');
  return event;
}

function createFixture(overrides: { hasFrame?: boolean } = {}) {
  const addFrame = vi.fn();
  const hideHoverOverlay = vi.fn();
  const session = createHoverSession();
  const handlers = createHoverInteractionHandlers({
    getCallbacks: () => ({
      addFrame,
      hasFrameForElement: vi.fn(() => overrides.hasFrame ?? false),
    }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
    },
    hoverThrottleMs: 100,
    overlayActions: { hideHoverOverlay, showHoverOverlay: vi.fn() },
    session,
  });
  return { addFrame, handlers, hideHoverOverlay, session };
}

describe('highlighter hover click interaction', () => {
  it('passes through when no target can be resolved', () => {
    const { handlers } = createFixture();
    const event = createClickEvent();
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(null);

    handlers.handleClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('passes through extension-owned targets', () => {
    const { handlers } = createFixture();
    const event = createClickEvent();
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(
      document.createElement('button')
    );
    targetPolicy.isHighlighterExtensionUiElement.mockReturnValueOnce(true);

    handlers.handleClick(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves an existing frame border click for the frame selection owner', () => {
    const { addFrame, handlers } = createFixture();
    const event = createClickEvent();
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(document.createElement('div'));
    targetPolicy.isNearExistingFrameBorder.mockReturnValueOnce(true);

    handlers.handleClick(event);

    expect(addFrame).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('uses top-viewport coordinates when arbitrating an iframe border click', () => {
    const { handlers, session } = createFixture();
    const iframe = document.createElement('iframe');
    iframe.getBoundingClientRect = vi.fn(() => new DOMRect(100, 200, 300, 180));
    const event = createClickEvent(12, 18);
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(document.createElement('div'));
    targetPolicy.isNearExistingFrameBorder.mockReturnValueOnce(true);

    handlers.handleClick(event, iframe);

    expect(targetPolicy.isNearExistingFrameBorder).toHaveBeenCalledWith(session, 112, 218);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('blocks duplicate frame creation after consuming the click', () => {
    const { addFrame, handlers } = createFixture({ hasFrame: true });
    const event = createClickEvent();
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(document.createElement('div'));

    handlers.handleClick(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(addFrame).not.toHaveBeenCalled();
  });

  it('creates a frame from the last hover target and freezes the preview', () => {
    const { addFrame, handlers, hideHoverOverlay, session } = createFixture();
    const lastHoverTarget = document.createElement('button');
    session.lastHoverTarget = lastHoverTarget;
    targetResolver.resolvePagePreparationTarget.mockReturnValueOnce(document.createElement('div'));

    handlers.handleClick(createClickEvent());

    expect(addFrame).toHaveBeenCalledWith(lastHoverTarget);
    expect(session.isHoverPreviewFrozen).toBe(true);
    expect(session.lastHoverTarget).toBeNull();
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
  });
});
