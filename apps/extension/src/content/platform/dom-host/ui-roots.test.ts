// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { CONTENT_APP_CONTAINER_ID, CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots, resolveInitializedContentShadowRoot } from './ui-roots';

function createShadowRoot(): ShadowRoot {
  const host = document.createElement('div');
  document.body.append(host);
  return host.attachShadow({ mode: 'open' });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('initializeContentUiRoots', () => {
  it('creates canonical app and overlay roots inside a supplied shadow tree', () => {
    const shadowRoot = createShadowRoot();

    const { appContainer, overlayRoot } = initializeContentUiRoots(shadowRoot);

    expect(appContainer.id).toBe(CONTENT_APP_CONTAINER_ID);
    expect(overlayRoot.id).toBe(CONTENT_OVERLAY_ROOT_ID);
    expect(overlayRoot.style.display).toBe('contents');
    expect(shadowRoot.getElementById(CONTENT_APP_CONTAINER_ID)).toBe(appContainer);
    expect(shadowRoot.getElementById(CONTENT_OVERLAY_ROOT_ID)).toBe(overlayRoot);
    expect(resolveInitializedContentShadowRoot()).toBe(shadowRoot);
  });

  it('reuses existing canonical roots', () => {
    const shadowRoot = createShadowRoot();
    const firstPass = initializeContentUiRoots(shadowRoot);

    expect(initializeContentUiRoots(shadowRoot)).toEqual(firstPass);
  });

  it('keeps a pending registration through the synchronous bootstrap append', () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);

    expect(resolveInitializedContentShadowRoot()).toBeNull();

    document.body.append(host);
    expect(resolveInitializedContentShadowRoot()).toBe(shadowRoot);
  });

  it('forgets a disconnected initialized host instead of reusing it after cleanup', () => {
    const shadowRoot = createShadowRoot();
    const host = shadowRoot.host;
    initializeContentUiRoots(shadowRoot);

    host.remove();
    document.body.append(host);
    expect(resolveInitializedContentShadowRoot()).toBeNull();

    initializeContentUiRoots(shadowRoot);
    expect(resolveInitializedContentShadowRoot()).toBeNull();
  });

  it('retires an active host after a connected reparent before the next resolver call', () => {
    const firstParent = document.createElement('div');
    const secondParent = document.createElement('div');
    document.body.append(firstParent, secondParent);
    const host = document.createElement('div');
    firstParent.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);

    secondParent.append(host);

    expect(resolveInitializedContentShadowRoot()).toBeNull();
  });

  it('disconnects the old observer when a new root is explicitly registered', () => {
    const firstShadowRoot = createShadowRoot();
    const firstHost = firstShadowRoot.host;
    initializeContentUiRoots(firstShadowRoot);
    const secondShadowRoot = createShadowRoot();
    initializeContentUiRoots(secondShadowRoot);

    firstHost.remove();

    expect(resolveInitializedContentShadowRoot()).toBe(secondShadowRoot);
  });
});
