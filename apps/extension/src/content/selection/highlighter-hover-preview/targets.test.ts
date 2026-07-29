// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const contentUiRoot = vi.hoisted(() => ({
  getContentUiElementById: vi.fn<(id: string) => HTMLElement | null>(),
  queryAllContentUiElements: vi.fn<(selector: string) => Element[]>(() => []),
  queryContentUiElement: vi.fn<(selector: string) => Element | null>(),
}));
const pageContext = vi.hoisted(() => ({
  isContentRuntimeUiElement: vi.fn(() => false),
}));

vi.mock('../../platform/dom-host', () => contentUiRoot);
vi.mock('../../platform/page-context/dom', () => pageContext);

import { createHoverSession } from './session';
import {
  hasBlockingHighlighterPopover,
  isInsideExistingFrame,
  isHighlighterExtensionUiElement,
  isNearExistingFrameBorder,
} from './targets';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('highlighter hover target policy', () => {
  it('detects direct classes and delegates portal/closest ownership checks', () => {
    const directTarget = document.createElement('button');
    directTarget.classList.add('sniptale-highlight');
    pageContext.isContentRuntimeUiElement.mockReturnValueOnce(true);
    expect(isHighlighterExtensionUiElement(directTarget)).toBe(true);

    const target = document.createElement('span');
    const portal = document.createElement('div');
    contentUiRoot.getContentUiElementById.mockReturnValueOnce(portal);
    pageContext.isContentRuntimeUiElement.mockReturnValueOnce(true);

    expect(isHighlighterExtensionUiElement(target)).toBe(true);
    expect(pageContext.isContentRuntimeUiElement).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        classNames: expect.arrayContaining(['sniptale-highlight']),
        portalElements: [portal],
      })
    );
  });

  it.each(['sniptale-frame-toolbar-trigger', 'sniptale-frame-toolbar-bridge'])(
    'keeps %s outside click-to-anchor and free-draw targets',
    (className) => {
      const target = document.createElement('button');
      target.className = className;
      pageContext.isContentRuntimeUiElement.mockReturnValueOnce(true);

      expect(isHighlighterExtensionUiElement(target)).toBe(true);
    }
  );

  it('detects popovers that block click handling', () => {
    contentUiRoot.queryContentUiElement.mockImplementation((selector) =>
      selector === '.sniptale-callout-settings-popover' ? document.createElement('div') : null
    );

    expect(hasBlockingHighlighterPopover()).toBe(true);
  });

  it('refreshes frame geometry through session authority for border and interior arbitration', () => {
    const session = createHoverSession();
    const frame = document.createElement('div');
    frame.dataset['frameId'] = 'frame-1';
    frame.getBoundingClientRect = vi.fn(() => new DOMRect(20, 40, 40, 40));
    contentUiRoot.queryAllContentUiElements.mockReturnValue([frame]);

    expect(isNearExistingFrameBorder(session, 15, 45)).toBe(true);
    expect(isNearExistingFrameBorder(session, 10, 60)).toBe(true);
    expect(isNearExistingFrameBorder(session, 40, 60)).toBe(false);
    expect(isInsideExistingFrame(session, 40, 60)).toBe(true);
    expect(isInsideExistingFrame(session, 15, 60)).toBe(false);
    expect(contentUiRoot.queryAllContentUiElements).toHaveBeenCalledOnce();
  });

  it('keeps every frame in the inventory and reads live geometry after resize', () => {
    const session = createHoverSession();
    const first = document.createElement('div');
    const second = document.createElement('div');
    first.className = 'sniptale-interactive-frame';
    second.className = 'sniptale-interactive-frame';
    first.dataset['frameId'] = 'frame-1';
    second.dataset['frameId'] = 'frame-2';
    first.getBoundingClientRect = vi.fn(() => new DOMRect(20, 40, 40, 40));
    let secondRect = new DOMRect(100, 120, 60, 40);
    second.getBoundingClientRect = vi.fn(() => secondRect);
    contentUiRoot.queryAllContentUiElements.mockReturnValue([first, second]);

    expect(isInsideExistingFrame(session, 40, 60)).toBe(true);
    expect(isInsideExistingFrame(session, 130, 140)).toBe(true);
    expect([...session.frameCache.keys()]).toEqual(['frame-1', 'frame-2']);

    secondRect = new DOMRect(180, 220, 80, 60);

    expect(isInsideExistingFrame(session, 130, 140)).toBe(false);
    expect(isInsideExistingFrame(session, 220, 250)).toBe(true);
    expect(contentUiRoot.queryAllContentUiElements).toHaveBeenCalledOnce();
  });
});
