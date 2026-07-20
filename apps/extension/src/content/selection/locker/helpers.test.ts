// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  findClosestInteractiveElementForLock,
  findClosestNavigationTargetForLock,
  getLockEventElements,
  isInteractiveElementForLock,
  isGwtInternalTabLink,
  isNavigationTargetForLock,
  isTextElementForQuickEditLock,
} from './helpers';

function createClickEvent(): Event {
  return new MouseEvent('click', { bubbles: true, composed: true });
}

function registerInteractiveTabIndexTest(): void {
  it('treats non-negative tabindex as interactive for lock purposes', () => {
    const element = document.createElement('div');
    element.setAttribute('tabindex', '2');

    expect(isInteractiveElementForLock(element)).toBe(true);
  });
}

function registerDelegatedNavigationTest(): void {
  it('finds delegated navigation targets from the event path', () => {
    const navigationRoot = document.createElement('div');
    navigationRoot.setAttribute('data-href', '/poll/result');
    const innerCanvas = document.createElement('canvas');
    navigationRoot.appendChild(innerCanvas);
    document.body.appendChild(navigationRoot);

    const event = createClickEvent();
    innerCanvas.dispatchEvent(event);
    const lockElements = getLockEventElements(event);

    expect(findClosestNavigationTargetForLock(lockElements)).toBe(navigationRoot);
  });
}

function registerInteractiveAncestorTest(): void {
  it('finds interactive ancestors from nested content', () => {
    const interactiveRoot = document.createElement('div');
    interactiveRoot.setAttribute('role', 'button');
    const innerLabel = document.createElement('span');
    interactiveRoot.appendChild(innerLabel);
    document.body.appendChild(interactiveRoot);

    const event = createClickEvent();
    innerLabel.dispatchEvent(event);
    const lockElements = getLockEventElements(event);

    expect(findClosestInteractiveElementForLock(lockElements)).toBe(interactiveRoot);
  });
}

function registerNavigationTargetTest(): void {
  it('detects anchor and data-attribute navigation targets but skips extension-owned nodes', () => {
    const anchor = document.createElement('a');
    anchor.href = '/details';

    const dataLink = document.createElement('div');
    dataLink.setAttribute('data-navigation-url', '/ticket/42');

    const extensionElement = document.createElement('div');
    extensionElement.className = 'sniptale-overlay';
    extensionElement.setAttribute('data-link', '/ignored');

    expect(isNavigationTargetForLock(anchor)).toBe(true);
    expect(isNavigationTargetForLock(dataLink)).toBe(true);
    expect(isNavigationTargetForLock(extensionElement)).toBe(false);
  });
}

function registerEventPathFallbackTest(): void {
  it('returns composedPath elements first and falls back to an empty array for non-HTMLElement targets', () => {
    const root = document.createElement('div');
    const child = document.createElement('button');
    root.appendChild(child);

    const eventWithPath = new Event('click');
    Object.defineProperty(eventWithPath, 'composedPath', {
      configurable: true,
      value: () => [child, root, window],
    });

    expect(getLockEventElements(eventWithPath)).toEqual([child, root]);

    const eventWithoutElementTarget = new Event('click');
    Object.defineProperty(eventWithoutElementTarget, 'target', {
      configurable: true,
      value: new EventTarget(),
    });

    expect(getLockEventElements(eventWithoutElementTarget)).toEqual([]);
  });
}

function registerGwtTabLinkTest(): void {
  it('recognizes GWT internal tab links, including malformed encoded hrefs', () => {
    expect(isGwtInternalTabLink(null)).toBe(false);
    expect(isGwtInternalTabLink('/workbench#!%7B%22tab%22%3A%22comments%22%7D')).toBe(true);
    expect(isGwtInternalTabLink('%E0%A4%A')).toBe(false);
    expect(isGwtInternalTabLink('/page?_tab=activity')).toBe(true);
  });
}

function registerQuickEditTextTest(): void {
  it('locks plain text nodes for quick edit but rejects extension-owned surfaces', () => {
    const content = document.createElement('div');
    content.textContent = 'Editable text';
    document.body.appendChild(content);

    const extensionWrapper = document.createElement('div');
    extensionWrapper.className = 'sniptale-toolbar';
    const extensionText = document.createElement('span');
    extensionText.textContent = 'Toolbar text';
    extensionWrapper.appendChild(extensionText);
    document.body.appendChild(extensionWrapper);

    const extensionClassText = document.createElement('span');
    extensionClassText.className = 'sniptale-inline';
    extensionClassText.textContent = 'Inline control';

    expect(isTextElementForQuickEditLock(content)).toBe(true);
    expect(isTextElementForQuickEditLock(extensionText)).toBe(false);
    expect(isTextElementForQuickEditLock(extensionClassText)).toBe(false);
  });
}

describe('locker helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  registerInteractiveTabIndexTest();
  registerDelegatedNavigationTest();
  registerInteractiveAncestorTest();
  registerNavigationTargetTest();
  registerEventPathFallbackTest();
  registerGwtTabLinkTest();
  registerQuickEditTextTest();
});
