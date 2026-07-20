// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  isContentOwnedElementMock,
  isExtensionUIElementMock,
  isNonDataInteractiveElementMock,
  resolveContentShadowRootMock,
  resolveIframeEventTargetMock,
} = vi.hoisted(() => ({
  isContentOwnedElementMock: vi.fn(),
  isExtensionUIElementMock: vi.fn(),
  isNonDataInteractiveElementMock: vi.fn(),
  resolveContentShadowRootMock: vi.fn(),
  resolveIframeEventTargetMock: vi.fn(),
}));

vi.mock('../../../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/dom-host')>()),
  isContentOwnedElement: isContentOwnedElementMock,
  resolveContentShadowRoot: resolveContentShadowRootMock,
}));

vi.mock('../../../../../platform/frame', () => ({
  resolveIframeEventTarget: resolveIframeEventTargetMock,
}));

vi.mock('../guards', () => ({
  isExtensionUIElement: isExtensionUIElementMock,
  isNonDataInteractiveElement: isNonDataInteractiveElementMock,
}));

import { resolveAiPickInteractionTarget } from '.';

beforeEach(() => {
  vi.clearAllMocks();
  isContentOwnedElementMock.mockReturnValue(false);
  isExtensionUIElementMock.mockReturnValue(false);
  isNonDataInteractiveElementMock.mockReturnValue(false);
  resolveContentShadowRootMock.mockReturnValue(null);
});

describe('ai-pick interaction target', () => {
  it('returns null when the iframe event target cannot be resolved', () => {
    resolveIframeEventTargetMock.mockReturnValue(null);

    expect(resolveAiPickInteractionTarget(new MouseEvent('mousemove'))).toBeNull();
  });

  it('returns the iframe event target when no pass-through resolution is needed', () => {
    const target = document.createElement('article');
    resolveIframeEventTargetMock.mockReturnValue(target);

    expect(resolveAiPickInteractionTarget(new MouseEvent('mousemove'))).toBe(target);
  });

  it('resolves through pass-through overlay elements to the underlying page element', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-blocking-overlay';
    const pageElement = document.createElement('section');
    target.ownerDocument.elementsFromPoint = vi.fn(() => [target, pageElement]);
    resolveIframeEventTargetMock.mockReturnValue(target);

    expect(resolveAiPickInteractionTarget(new MouseEvent('mousemove'))).toBe(pageElement);
  });

  it('prefers a non-scaffold shadow target for content-owned roots', () => {
    const target = document.createElement('div');
    const shadowTarget = document.createElement('button');
    const scaffold = document.createElement('div');
    scaffold.id = 'frame-container-1';
    resolveIframeEventTargetMock.mockReturnValue(target);
    isContentOwnedElementMock.mockReturnValue(true);
    resolveContentShadowRootMock.mockReturnValue({
      elementsFromPoint: vi.fn(() => [scaffold, shadowTarget]),
    });

    expect(resolveAiPickInteractionTarget(new MouseEvent('mousemove'))).toBe(shadowTarget);
  });
});
