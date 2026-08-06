// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const targetPolicy = vi.hoisted(() => ({
  hasBlockingHighlighterPopover: vi.fn(() => false),
  isInsideExistingFrame: vi.fn(() => false),
  isHighlighterExtensionUiElement: vi.fn(() => false),
  isNearExistingFrameBorder: vi.fn(() => false),
}));

vi.mock('./targets', () => targetPolicy);

import { scheduleHoverOverlayUpdate, shouldIgnoreHighlighterClick } from './interactions';
import { createHoverSession } from './session';
import { resolveSelectablePageHtmlElement } from '../page-element-target';

function createIframeTarget() {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument;
  const iframeWindow = iframe.contentWindow;
  if (!iframeDoc || !iframeWindow) throw new Error('Expected iframe document');
  Object.defineProperty(iframeWindow, 'frameElement', { configurable: true, value: iframe });
  vi.spyOn(iframeWindow, 'getComputedStyle').mockReturnValue({
    display: 'block',
    opacity: '1',
    visibility: 'visible',
  } as CSSStyleDeclaration);
  const innerTarget = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(innerTarget);
  const rect = DOMRect.fromRect({ height: 24, width: 48, x: 0, y: 0 });
  Object.defineProperty(innerTarget, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  Object.defineProperty(iframeDoc, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => innerTarget),
  });
  return { iframe, innerTarget };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('highlighter hover target/event policy', () => {
  it('shows the inner iframe element resolved from pointer coordinates', () => {
    const { iframe, innerTarget } = createIframeTarget();
    const session = createHoverSession();
    const showHoverOverlay = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const event = new MouseEvent('mousemove', { clientX: 18, clientY: 10 });
    iframe.dispatchEvent(event);

    const resolvedTarget = resolveSelectablePageHtmlElement(event, iframe);
    expect(resolvedTarget === innerTarget).toBe(true);

    scheduleHoverOverlayUpdate({
      event,
      iframe,
      getCallbacks: () => ({ addFrame: null, hasFrameForElement: () => false }),
      getState: { isModeEnabled: () => true, isPaused: () => false },
      hideHoverOverlay: vi.fn(),
      session,
      showHoverOverlay,
    });

    expect(showHoverOverlay.mock.calls[0]?.[0] === innerTarget).toBe(true);
    expect(session.lastHoverTarget === innerTarget).toBe(true);
  });

  it('ignores clicks while blocking UI is active', () => {
    targetPolicy.hasBlockingHighlighterPopover.mockReturnValueOnce(true);

    expect(
      shouldIgnoreHighlighterClick({
        eventTarget: document.createElement('button'),
        getState: {
          isModeEnabled: () => true,
          isPaused: () => false,
        },
      })
    ).toBe(true);
  });

  it('allows ordinary page clicks while hover mode is active', () => {
    expect(
      shouldIgnoreHighlighterClick({
        eventTarget: document.createElement('button'),
        getState: {
          isModeEnabled: () => true,
          isPaused: () => false,
        },
      })
    ).toBe(false);
  });

  it('ignores clicks while mode is disabled', () => {
    expect(
      shouldIgnoreHighlighterClick({
        eventTarget: document.createElement('button'),
        getState: {
          isModeEnabled: () => false,
          isPaused: () => false,
        },
      })
    ).toBe(true);
    expect(targetPolicy.isHighlighterExtensionUiElement).not.toHaveBeenCalled();
  });
});
