// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_OVERLAY_ROOT_ID, CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../../../platform/dom-host';
import { isAiPickPassThroughUiElement } from './passthrough';
import { isAiPickShadowScaffoldElement } from './shadow';

afterEach(() => {
  document.body.replaceChildren();
});

describe('ai-pick interaction-target ownership', () => {
  it('requires exact shadow ownership for pass-through classes and scaffold ids', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const { overlayRoot } = initializeContentUiRoots(shadowRoot);
    const ownedOverlay = document.createElement('div');
    ownedOverlay.className = 'sniptale-blocking-overlay';
    shadowRoot.append(ownedOverlay);

    const pageOverlay = ownedOverlay.cloneNode() as HTMLElement;
    const pageScaffold = document.createElement('div');
    pageScaffold.id = CONTENT_OVERLAY_ROOT_ID;
    document.body.append(pageOverlay, pageScaffold);
    const lightDomOverlay = ownedOverlay.cloneNode() as HTMLElement;
    const lightDomScaffold = pageScaffold.cloneNode() as HTMLElement;
    host.append(lightDomOverlay, lightDomScaffold);

    expect(isAiPickPassThroughUiElement(ownedOverlay)).toBe(true);
    expect(isAiPickShadowScaffoldElement(overlayRoot)).toBe(true);
    expect(isAiPickPassThroughUiElement(pageOverlay)).toBe(false);
    expect(isAiPickPassThroughUiElement(lightDomOverlay)).toBe(false);
    expect(isAiPickShadowScaffoldElement(pageScaffold)).toBe(false);
    expect(isAiPickShadowScaffoldElement(lightDomScaffold)).toBe(false);
  });
});
