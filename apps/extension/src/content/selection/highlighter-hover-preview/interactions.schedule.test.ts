// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const targetResolver = vi.hoisted(() => ({ resolveSelectablePageHtmlElement: vi.fn() }));
const targetPolicy = vi.hoisted(() => ({
  hasBlockingHighlighterPopover: vi.fn(() => false),
  isInsideExistingFrame: vi.fn(() => false),
  isHighlighterExtensionUiElement: vi.fn(() => false),
  isNearExistingFrameBorder: vi.fn(() => false),
}));

vi.mock('../page-element-target', () => targetResolver);
vi.mock('./targets', () => targetPolicy);

import { scheduleHoverOverlayUpdate } from './interactions';
import { createHoverSession } from './session';

function createArgs() {
  const hideHoverOverlay = vi.fn();
  const showHoverOverlay = vi.fn(() => true);
  const session = createHoverSession();
  const args: Parameters<typeof scheduleHoverOverlayUpdate>[0] = {
    event: new MouseEvent('mousemove', { clientX: 120, clientY: 80 }),
    getCallbacks: () => ({ addFrame: null, hasFrameForElement: null }),
    getState: { isModeEnabled: () => true, isPaused: () => false },
    hideHoverOverlay,
    session,
    showHoverOverlay,
  };
  return {
    hideHoverOverlay,
    session,
    showHoverOverlay,
    args,
  };
}

describe('highlighter hover scheduling', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 77;
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('does nothing while a frame request is pending', () => {
    const { args, session } = createArgs();
    session.hoverRafId = 5;

    scheduleHoverOverlayUpdate(args);

    expect(targetResolver.resolveSelectablePageHtmlElement).not.toHaveBeenCalled();
  });

  it('records coordinates and hides when no target resolves', () => {
    const { args, hideHoverOverlay, session } = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(null);
    vi.spyOn(Date, 'now').mockReturnValueOnce(321);

    scheduleHoverOverlayUpdate(args);

    expect(session).toMatchObject({
      lastHoverProcessTime: 321,
      lastHoverTarget: null,
      lastHoverX: 120,
      lastHoverY: 80,
    });
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
  });

  it('hides suppressed and already-framed targets', () => {
    const target = document.createElement('div');
    const first = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValue(target);
    targetPolicy.isHighlighterExtensionUiElement.mockReturnValueOnce(true);

    scheduleHoverOverlayUpdate(first.args);

    expect(first.hideHoverOverlay).toHaveBeenCalledOnce();

    const second = createArgs();
    second.session.lastHoverTarget = document.createElement('span');
    second.args.getCallbacks = () => ({
      addFrame: null,
      hasFrameForElement: (element) => element === target,
    });
    scheduleHoverOverlayUpdate(second.args);

    expect(second.hideHoverOverlay).toHaveBeenCalledOnce();
    expect(second.showHoverOverlay).not.toHaveBeenCalled();
  });

  it('keeps the same target visible without repeating work', () => {
    const target = document.createElement('div');
    const { args, hideHoverOverlay, session, showHoverOverlay } = createArgs();
    session.lastHoverTarget = target;
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(target);

    scheduleHoverOverlayUpdate(args);

    expect(hideHoverOverlay).not.toHaveBeenCalled();
    expect(showHoverOverlay).not.toHaveBeenCalled();
  });

  it('shows a new eligible target and records it', () => {
    const target = document.createElement('div');
    const { args, session, showHoverOverlay } = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(target);

    scheduleHoverOverlayUpdate(args);

    expect(showHoverOverlay).toHaveBeenCalledWith(target);
    expect(session.lastHoverTarget).toBe(target);
    expect(session.hoverRafId).toBe(77);
  });

  it('does not retain a target when the preview owner refuses to show it', () => {
    const target = document.createElement('div');
    const { args, hideHoverOverlay, session, showHoverOverlay } = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(target);
    showHoverOverlay.mockReturnValueOnce(false);

    scheduleHoverOverlayUpdate(args);

    expect(showHoverOverlay).toHaveBeenCalledWith(target);
    expect(hideHoverOverlay).toHaveBeenCalledOnce();
    expect(session.lastHoverTarget).toBeNull();
  });

  it('shows an eligible nested target inside an existing annotation frame', () => {
    const target = document.createElement('button');
    const { args, session, showHoverOverlay } = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(target);
    targetPolicy.isInsideExistingFrame.mockReturnValueOnce(true);

    scheduleHoverOverlayUpdate(args);

    expect(showHoverOverlay).toHaveBeenCalledWith(target);
    expect(session.lastHoverTarget).toBe(target);
  });

  it('stops inside the frame when mode state changes before processing', () => {
    const target = document.createElement('div');
    const { args, hideHoverOverlay, showHoverOverlay } = createArgs();
    targetResolver.resolveSelectablePageHtmlElement.mockReturnValueOnce(target);
    args.getState = { isModeEnabled: () => false, isPaused: () => true };

    scheduleHoverOverlayUpdate(args);

    expect(showHoverOverlay).not.toHaveBeenCalled();
    expect(hideHoverOverlay).not.toHaveBeenCalled();
  });
});
