// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const iframeUtilsCoreMocks = vi.hoisted(() => ({
  getIframeDocumentMock: vi.fn<(iframe: HTMLIFrameElement) => Document | null>(),
  isIframeAccessibleMock: vi.fn<(iframe: HTMLIFrameElement) => boolean>(),
}));

vi.mock('./core', () => ({
  getIframeDocument: iframeUtilsCoreMocks.getIframeDocumentMock,
  isIframeAccessible: iframeUtilsCoreMocks.isIframeAccessibleMock,
}));

import { resolveIframeEventTarget } from './target';

function createPointerEvent(
  overrides: Partial<Event & { clientX?: number; clientY?: number }> = {}
): Event {
  const event = new Event('pointerdown', { bubbles: true }) as Event & {
    clientX?: number;
    clientY?: number;
    composedPath?: () => EventTarget[];
  };

  if ('clientX' in overrides) {
    Object.defineProperty(event, 'clientX', {
      configurable: true,
      value: overrides.clientX,
    });
  }

  if ('clientY' in overrides) {
    Object.defineProperty(event, 'clientY', {
      configurable: true,
      value: overrides.clientY,
    });
  }

  if ('target' in overrides) {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: overrides.target,
    });
  }

  if ('composedPath' in overrides && overrides.composedPath) {
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: overrides.composedPath,
    });
  }

  return event;
}

afterEach(() => {
  iframeUtilsCoreMocks.getIframeDocumentMock.mockReset();
  iframeUtilsCoreMocks.isIframeAccessibleMock.mockReset();
  document.body.replaceChildren();
});

describe('iframe-utils-target basic fallbacks', () => {
  it('returns null when the event has no element target in target or composedPath', () => {
    const event = createPointerEvent({
      composedPath: () => [window, document],
      target: document.createTextNode('text'),
    });

    expect(resolveIframeEventTarget(event)).toBeNull();
  });

  it('prefers the first element from composedPath and returns it when there is no client point', () => {
    const target = document.createElement('button');
    const fallbackTarget = document.createElement('div');
    const event = createPointerEvent({
      composedPath: () => [target, fallbackTarget],
      target: fallbackTarget,
    });

    expect(resolveIframeEventTarget(event)).toBe(target);
  });
});

describe('iframe-utils-target explicit iframe resolution', () => {
  it('returns the deepest target from the provided iframe document', () => {
    const eventTarget = document.createElement('div');
    const iframe = document.createElement('iframe');
    const iframeDoc = document.implementation.createHTMLDocument('iframe');
    const nestedTarget = iframeDoc.createElement('button');
    const elementFromPoint = vi.fn(() => nestedTarget);

    Object.defineProperty(iframeDoc, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    iframeUtilsCoreMocks.getIframeDocumentMock.mockReturnValue(iframeDoc);

    const event = createPointerEvent({
      clientX: 40,
      clientY: 50,
      target: eventTarget,
    });

    expect(resolveIframeEventTarget(event, iframe)).toBe(nestedTarget);
    expect(elementFromPoint).toHaveBeenCalledWith(40, 50);
  });

  it('falls back to the original target when the provided iframe has no resolvable document target', () => {
    const target = document.createElement('div');
    const iframe = document.createElement('iframe');
    iframeUtilsCoreMocks.getIframeDocumentMock.mockReturnValue(null);

    const event = createPointerEvent({
      clientX: 10,
      clientY: 20,
      target,
    });

    expect(resolveIframeEventTarget(event, iframe)).toBe(target);
  });
});

describe('iframe-utils-target iframe fallback', () => {
  it('returns the iframe target itself when the iframe document is unavailable', () => {
    const iframe = document.createElement('iframe');
    iframeUtilsCoreMocks.isIframeAccessibleMock.mockReturnValue(true);
    iframeUtilsCoreMocks.getIframeDocumentMock.mockReturnValue(null);

    const event = createPointerEvent({
      clientX: 15,
      clientY: 25,
      target: iframe,
    });

    expect(resolveIframeEventTarget(event)).toBe(iframe);
  });
});

describe('iframe-utils-target iframe coordinate resolution', () => {
  it('resolves nested iframe coordinates and returns the deepest accessible child element', () => {
    const iframe = document.createElement('iframe');
    const iframeDoc = document.implementation.createHTMLDocument('nested');
    const nestedTarget = iframeDoc.createElement('span');
    const elementFromPoint = vi.fn(() => nestedTarget);

    Object.defineProperty(iframe, 'clientLeft', {
      configurable: true,
      value: 3,
    });
    Object.defineProperty(iframe, 'clientTop', {
      configurable: true,
      value: 4,
    });
    Object.defineProperty(iframe, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          bottom: 140,
          height: 80,
          left: 100,
          right: 220,
          top: 50,
          width: 120,
          x: 100,
          y: 50,
          toJSON: () => ({}),
        }) satisfies DOMRect,
    });
    Object.defineProperty(iframeDoc, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    iframeUtilsCoreMocks.isIframeAccessibleMock.mockReturnValue(true);
    iframeUtilsCoreMocks.getIframeDocumentMock.mockReturnValue(iframeDoc);

    const event = createPointerEvent({
      clientX: 150,
      clientY: 90,
      target: iframe,
    });

    expect(resolveIframeEventTarget(event)).toBe(nestedTarget);
    expect(elementFromPoint).toHaveBeenCalledWith(47, 36);
  });
});

describe('iframe-utils-target inaccessible iframe fallback', () => {
  it('returns the original target when the iframe is not accessible', () => {
    const iframe = document.createElement('iframe');
    iframeUtilsCoreMocks.isIframeAccessibleMock.mockReturnValue(false);

    const event = createPointerEvent({
      clientX: 1,
      clientY: 2,
      target: iframe,
    });

    expect(resolveIframeEventTarget(event)).toBe(iframe);
  });
});
