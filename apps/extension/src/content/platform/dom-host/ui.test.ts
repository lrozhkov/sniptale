// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONTENT_APP_CONTAINER_ID,
  CONTENT_OVERLAY_ROOT_ID,
  CONTENT_ROOT_ID,
} from '@sniptale/ui/branding';
import {
  appendToContentOverlayRoot,
  getContentEventTargetElement,
  getContentUiElementById,
  initializeContentUiRoots,
  isContentEventWithinAnyElement,
  isContentEventWithinElement,
  isContentOwnedEvent,
  isContentOwnedElement,
  isContentOwnedPassiveChrome,
  PASSIVE_CONTENT_CHROME,
  queryAllContentUiElements,
  queryContentUiElement,
  registerContentOwnedPassiveChrome,
  resolveContentAppContainer,
  resolveContentOverlayRoot,
  resolveContentShadowRoot,
  ensureContentUiMountTarget,
  toggleContentHostClass,
} from './ui';

function mountContentHost() {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  return { host, shadowRoot };
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content-root pre-bootstrap compatibility', () => {
  it('uses light-DOM lookup and mount fallbacks only before the first registration', () => {
    const bodyMatch = document.createElement('div');
    bodyMatch.id = 'body-target';
    bodyMatch.className = 'shared-target';
    document.body.append(bodyMatch);

    expect(resolveContentShadowRoot()).toBeNull();
    expect(resolveContentAppContainer()).toBeNull();
    expect(resolveContentOverlayRoot()).toBeNull();
    expect(ensureContentUiMountTarget()).toBe(document.body);
    expect(getContentUiElementById('body-target')).toBe(bodyMatch);
    expect(queryContentUiElement('#body-target')).toBe(bodyMatch);
    expect(queryAllContentUiElements('.shared-target')).toEqual([bodyMatch]);

    const marker = document.createElement('div');
    expect(appendToContentOverlayRoot(marker)).toBe(marker);
    expect(document.body.contains(marker)).toBe(true);
  });
});

describe('content-root ui initialization', () => {
  it('creates and resolves canonical app and overlay roots inside the content shadow tree', () => {
    const { shadowRoot } = mountContentHost();

    expect(resolveContentShadowRoot()).toBeNull();

    const { appContainer, overlayRoot } = initializeContentUiRoots(shadowRoot);

    expect(resolveContentShadowRoot()).toBe(shadowRoot);
    expect(appContainer.id).toBe(CONTENT_APP_CONTAINER_ID);
    expect(overlayRoot.id).toBe(CONTENT_OVERLAY_ROOT_ID);
    expect(overlayRoot.style.display).toBe('contents');
    expect(resolveContentAppContainer()).toBe(appContainer);
    expect(resolveContentOverlayRoot()).toBe(overlayRoot);
    expect(ensureContentUiMountTarget('app')).toBe(appContainer);
    expect(ensureContentUiMountTarget()).toBe(overlayRoot);

    const secondPass = initializeContentUiRoots(shadowRoot);
    expect(secondPass.appContainer).toBe(appContainer);
    expect(secondPass.overlayRoot).toBe(overlayRoot);
  });

  it('recreates a missing mount target inside the registered shadow root', () => {
    const { shadowRoot } = mountContentHost();
    const { overlayRoot } = initializeContentUiRoots(shadowRoot);
    overlayRoot.remove();
    const pageLookalike = document.createElement('div');
    pageLookalike.id = CONTENT_OVERLAY_ROOT_ID;
    document.body.append(pageLookalike);

    const marker = document.createElement('div');
    appendToContentOverlayRoot(marker);

    const recreated = resolveContentOverlayRoot();
    expect(recreated).not.toBeNull();
    expect(recreated).not.toBe(overlayRoot);
    expect(recreated?.getRootNode()).toBe(shadowRoot);
    expect(recreated?.contains(marker)).toBe(true);
    expect(pageLookalike.contains(marker)).toBe(false);
  });
});

describe('content-root ui ownership and events', () => {
  it('detects content-owned elements and resolves event targets across shadow boundaries', () => {
    const { host, shadowRoot } = mountContentHost();
    const { appContainer } = initializeContentUiRoots(shadowRoot);
    const shadowButton = document.createElement('button');
    appContainer.append(shadowButton);
    const lightDomChild = document.createElement('button');
    host.append(lightDomChild);
    const outsideElement = document.createElement('div');
    document.body.append(outsideElement);

    expect(isContentOwnedElement(host)).toBe(true);
    expect(isContentOwnedElement(shadowButton)).toBe(true);
    expect(isContentOwnedElement(lightDomChild)).toBe(false);
    expect(isContentOwnedElement(outsideElement)).toBe(false);
    expect(isContentOwnedElement(null)).toBe(false);

    expect(
      getContentEventTargetElement({
        composedPath: () => [shadowButton],
        target: host,
      })
    ).toBe(shadowButton);
    expect(isContentOwnedEvent({ composedPath: () => [shadowButton], target: host })).toBe(true);
    expect(isContentOwnedEvent({ composedPath: () => [shadowRoot, host], target: host })).toBe(
      true
    );
    expect(isContentOwnedEvent({ target: outsideElement })).toBe(false);
    expect(getContentEventTargetElement({ target: outsideElement })).toBe(outsideElement);
    expect(getContentEventTargetElement({ target: null })).toBeNull();
  });

  it('does not treat a same-id host lookalike as content-owned', () => {
    const lookalike = document.createElement('div');
    lookalike.id = CONTENT_ROOT_ID;
    const lookalikeChild = document.createElement('button');
    lookalike.append(lookalikeChild);
    document.body.append(lookalike);
    const { host, shadowRoot } = mountContentHost();
    const { appContainer } = initializeContentUiRoots(shadowRoot);
    const shadowButton = document.createElement('button');
    appContainer.append(shadowButton);

    toggleContentHostClass('sniptale-test-active', true);

    expect(resolveContentShadowRoot()).toBe(shadowRoot);
    expect(isContentOwnedElement(host)).toBe(true);
    expect(isContentOwnedElement(shadowButton)).toBe(true);
    expect(isContentOwnedElement(lookalike)).toBe(false);
    expect(isContentOwnedElement(lookalikeChild)).toBe(false);
    expect(host.classList.contains('sniptale-test-active')).toBe(true);
    expect(lookalike.classList.contains('sniptale-test-active')).toBe(false);
    expect(
      isContentOwnedEvent({
        composedPath: () => [lookalikeChild, lookalike],
        target: lookalikeChild,
      })
    ).toBe(false);
  });

  it('retires remove-reinserted identity and accepts only an explicitly initialized replacement', () => {
    const { host, shadowRoot } = mountContentHost();
    initializeContentUiRoots(shadowRoot);
    host.remove();
    document.body.append(host);

    expect(resolveContentShadowRoot()).toBeNull();
    expect(isContentOwnedElement(host)).toBe(false);

    initializeContentUiRoots(shadowRoot);
    expect(resolveContentShadowRoot()).toBeNull();
    expect(isContentOwnedElement(host)).toBe(false);

    const { host: replacementHost, shadowRoot: replacementShadowRoot } = mountContentHost();
    initializeContentUiRoots(replacementShadowRoot);
    expect(resolveContentShadowRoot()).toBe(replacementShadowRoot);
    expect(isContentOwnedElement(replacementHost)).toBe(true);
    expect(isContentOwnedElement(host)).toBe(false);
  });

  it('recognizes only exact passive hits in the live content root', () => {
    const { host, shadowRoot } = mountContentHost();
    initializeContentUiRoots(shadowRoot);
    const passiveSurface = document.createElement('div');
    const nestedControl = document.createElement('button');
    const forgedOwnedControl = document.createElement('button');
    const pageCreatedMarkedNode = document.createElement('div');
    const classOnlySurface = document.createElement('div');
    const pageLookalike = document.createElement('div');
    Object.entries(PASSIVE_CONTENT_CHROME).forEach(([name, value]) => {
      forgedOwnedControl.setAttribute(name, value);
      pageCreatedMarkedNode.setAttribute(name, value);
      pageLookalike.setAttribute(name, value);
    });
    classOnlySurface.className = 'sniptale-interactive-frame';
    passiveSurface.append(nestedControl);
    shadowRoot.append(passiveSurface, forgedOwnedControl, pageCreatedMarkedNode, classOnlySurface);
    document.body.append(pageLookalike);
    const unregisterPassiveSurface = registerContentOwnedPassiveChrome(passiveSurface);

    expect(isContentOwnedPassiveChrome(passiveSurface)).toBe(true);
    expect(isContentOwnedPassiveChrome(nestedControl)).toBe(false);
    expect(isContentOwnedPassiveChrome(forgedOwnedControl)).toBe(false);
    expect(isContentOwnedPassiveChrome(pageCreatedMarkedNode)).toBe(false);
    expect(isContentOwnedPassiveChrome(classOnlySurface)).toBe(false);
    expect(isContentOwnedPassiveChrome(pageLookalike)).toBe(false);
    expect(isContentOwnedPassiveChrome(null)).toBe(false);

    unregisterPassiveSurface();
    expect(isContentOwnedPassiveChrome(passiveSurface)).toBe(false);
    expect(passiveSurface.hasAttribute('data-sniptale-content-chrome')).toBe(false);

    const cleanupRetiredSurface = registerContentOwnedPassiveChrome(passiveSurface);

    host.remove();
    document.body.append(host);
    expect(isContentOwnedPassiveChrome(passiveSurface)).toBe(false);
    cleanupRetiredSurface();
  });

  it('checks whether events flow through one or more candidate elements', () => {
    const wrapper = document.createElement('div');
    const child = document.createElement('button');
    wrapper.append(child);
    document.body.append(wrapper);
    const sibling = document.createElement('div');
    document.body.append(sibling);

    expect(
      isContentEventWithinElement({ composedPath: () => [child, wrapper], target: child }, wrapper)
    ).toBe(true);
    expect(isContentEventWithinElement({ target: child }, sibling)).toBe(false);
    expect(
      isContentEventWithinAnyElement({ composedPath: () => [child, wrapper], target: child }, [
        sibling,
        wrapper,
      ])
    ).toBe(true);
    expect(isContentEventWithinAnyElement({ target: child }, [sibling, null])).toBe(false);
  });
});

describe('content-root ui lookup helpers', () => {
  it('never returns page light-DOM lookalikes after exact shadow-root registration', () => {
    const pageLookalike = document.createElement('div');
    pageLookalike.id = 'shared-target';
    pageLookalike.className = 'shared-target';
    const pageOnlyMatch = document.createElement('div');
    pageOnlyMatch.id = 'page-only-target';
    pageOnlyMatch.className = 'page-only-target';
    document.body.append(pageLookalike, pageOnlyMatch);

    const { shadowRoot } = mountContentHost();
    const { appContainer } = initializeContentUiRoots(shadowRoot);
    const shadowMatch = document.createElement('div');
    shadowMatch.id = 'shared-target';
    shadowMatch.className = 'shared-target';
    appContainer.append(shadowMatch);

    expect(getContentUiElementById('shared-target')).toBe(shadowMatch);
    expect(queryContentUiElement('#shared-target')).toBe(shadowMatch);
    expect(queryAllContentUiElements('.shared-target')).toEqual([shadowMatch]);
    expect(getContentUiElementById('page-only-target')).toBeNull();
    expect(queryContentUiElement('#page-only-target')).toBeNull();
    expect(queryAllContentUiElements('.page-only-target')).toEqual([]);
  });

  it('fails closed for lookup and mount after the active host is removed and reinserted', () => {
    const pageLookalike = document.createElement('div');
    pageLookalike.id = 'retired-target';
    pageLookalike.className = 'retired-target';
    document.body.append(pageLookalike);
    const { host, shadowRoot } = mountContentHost();
    initializeContentUiRoots(shadowRoot);

    host.remove();
    document.body.append(host);

    expect(resolveContentShadowRoot()).toBeNull();
    expect(getContentUiElementById('retired-target')).toBeNull();
    expect(queryContentUiElement('#retired-target')).toBeNull();
    expect(queryAllContentUiElements('.retired-target')).toEqual([]);

    const failClosedMount = ensureContentUiMountTarget();
    const marker = document.createElement('div');
    appendToContentOverlayRoot(marker);
    expect(failClosedMount.isConnected).toBe(false);
    expect(failClosedMount.contains(marker)).toBe(true);
    expect(document.body.contains(marker)).toBe(false);
  });
});
