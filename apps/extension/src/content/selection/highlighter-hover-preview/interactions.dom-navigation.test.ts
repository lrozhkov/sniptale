// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./targets', () => ({
  hasBlockingHighlighterPopover: vi.fn(() => false),
  isInsideExistingFrame: vi.fn(() => false),
  isHighlighterExtensionUiElement: vi.fn(() => false),
  isNearExistingFrameBorder: vi.fn(() => false),
}));

import { createHoverInteractionHandlers } from './interactions';
import { createHoverSession } from './session';

function makeVisible<T extends Element>(element: T): T {
  const rect = DOMRect.fromRect({ height: 32, width: 96, x: 20, y: 30 });
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => ({
      0: rect,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
      item: (index: number) => (index === 0 ? rect : null),
      length: 1,
    }),
  });
  return element;
}

function createHandlers(addFrame: (element: HTMLElement) => void) {
  return createHoverInteractionHandlers({
    getCallbacks: () => ({ addFrame, hasFrameForElement: () => false }),
    getState: {
      isFrameEditing: () => false,
      isModeEnabled: () => true,
      isPaused: () => false,
    },
    hoverThrottleMs: 100,
    overlayActions: { hideHoverOverlay: vi.fn(), showHoverOverlay: vi.fn() },
    session: createHoverSession(),
  });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Annotation DOM navigation', () => {
  it('creates a frame for the exact open-shadow DOM element', () => {
    const host = makeVisible(document.createElement('article'));
    const target = makeVisible(document.createElement('button'));
    host.attachShadow({ mode: 'open' }).append(target);
    document.body.append(host);
    const addFrame = vi.fn();
    const handlers = createHandlers(addFrame);
    const listener = (event: MouseEvent) => handlers.handleClick(event);
    window.addEventListener('click', listener, { capture: true, once: true });

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    target.dispatchEvent(event);

    expect(addFrame).toHaveBeenCalledWith(target);
    expect(event.defaultPrevented).toBe(true);
  });

  it('creates a frame for the visible label instead of its hidden form control', () => {
    const input = makeVisible(document.createElement('input'));
    input.id = 'annotation-language-toggle';
    input.style.opacity = '0';
    const label = makeVisible(document.createElement('label'));
    label.htmlFor = input.id;
    document.body.append(input, label);
    const addFrame = vi.fn();
    const handlers = createHandlers(addFrame);
    const listener = (event: MouseEvent) => handlers.handleClick(event);
    window.addEventListener('click', listener, { capture: true, once: true });

    input.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );

    expect(addFrame).toHaveBeenCalledWith(label);
  });

  it('creates a frame for the HTML host of an open-shadow SVG target', () => {
    const host = makeVisible(document.createElement('article'));
    const svg = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const path = makeVisible(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    svg.append(path);
    host.attachShadow({ mode: 'open' }).append(svg);
    document.body.append(host);
    const addFrame = vi.fn();
    const handlers = createHandlers(addFrame);
    const listener = (event: MouseEvent) => handlers.handleClick(event);
    window.addEventListener('click', listener, { capture: true, once: true });

    path.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
    );

    expect(addFrame).toHaveBeenCalledWith(host);
  });
});
