// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { CONTENT_APP_CONTAINER_ID, CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from './ui-roots';

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
  });

  it('reuses existing canonical roots', () => {
    const shadowRoot = createShadowRoot();
    const firstPass = initializeContentUiRoots(shadowRoot);

    expect(initializeContentUiRoots(shadowRoot)).toEqual(firstPass);
  });
});
