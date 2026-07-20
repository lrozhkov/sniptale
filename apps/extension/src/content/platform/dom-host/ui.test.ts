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
  queryAllContentUiElements,
  queryContentUiElement,
  resolveContentAppContainer,
  resolveContentOverlayRoot,
  resolveContentShadowRoot,
  resolveContentUiMountTarget,
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

describe('content-root ui initialization', () => {
  it('creates and resolves canonical app and overlay roots inside the content shadow tree', () => {
    const { shadowRoot } = mountContentHost();

    expect(resolveContentShadowRoot()).toBe(shadowRoot);

    const { appContainer, overlayRoot } = initializeContentUiRoots(shadowRoot);

    expect(appContainer.id).toBe(CONTENT_APP_CONTAINER_ID);
    expect(overlayRoot.id).toBe(CONTENT_OVERLAY_ROOT_ID);
    expect(overlayRoot.style.display).toBe('contents');
    expect(resolveContentAppContainer()).toBe(appContainer);
    expect(resolveContentOverlayRoot()).toBe(overlayRoot);
    expect(resolveContentUiMountTarget('app')).toBe(appContainer);
    expect(resolveContentUiMountTarget()).toBe(overlayRoot);

    const secondPass = initializeContentUiRoots(shadowRoot);
    expect(secondPass.appContainer).toBe(appContainer);
    expect(secondPass.overlayRoot).toBe(overlayRoot);
  });

  it('falls back to document.body when content roots are not available', () => {
    expect(resolveContentShadowRoot()).toBeNull();
    expect(resolveContentAppContainer()).toBeNull();
    expect(resolveContentOverlayRoot()).toBeNull();
    expect(resolveContentUiMountTarget()).toBe(document.body);

    const marker = document.createElement('div');
    expect(appendToContentOverlayRoot(marker)).toBe(marker);
    expect(document.body.contains(marker)).toBe(true);
  });
});

describe('content-root ui ownership and events', () => {
  it('detects content-owned elements and resolves event targets across shadow boundaries', () => {
    const { host, shadowRoot } = mountContentHost();
    const { appContainer } = initializeContentUiRoots(shadowRoot);
    const shadowButton = document.createElement('button');
    appContainer.append(shadowButton);
    const outsideElement = document.createElement('div');
    document.body.append(outsideElement);

    expect(isContentOwnedElement(host)).toBe(true);
    expect(isContentOwnedElement(shadowButton)).toBe(true);
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
  it('queries shadow-root elements before falling back to the light DOM', () => {
    const { shadowRoot } = mountContentHost();
    const { appContainer, overlayRoot } = initializeContentUiRoots(shadowRoot);
    const shadowMatch = document.createElement('div');
    shadowMatch.id = 'shadow-target';
    shadowMatch.className = 'shared-target';
    appContainer.append(shadowMatch);

    const lightMatch = document.createElement('div');
    lightMatch.id = 'light-target';
    lightMatch.className = 'shared-target';
    overlayRoot.append(lightMatch);

    const bodyFallback = document.createElement('div');
    bodyFallback.id = 'body-target';
    bodyFallback.className = 'shared-target';
    document.body.append(bodyFallback);

    expect(getContentUiElementById('shadow-target')).toBe(shadowMatch);
    expect(getContentUiElementById('body-target')).toBe(bodyFallback);
    expect(queryContentUiElement('#shadow-target')).toBe(shadowMatch);
    expect(queryContentUiElement('#body-target')).toBe(bodyFallback);
    expect(queryAllContentUiElements('.shared-target')).toEqual([
      shadowMatch,
      lightMatch,
      bodyFallback,
    ]);
  });
});
