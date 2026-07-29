// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../platform/dom-host';
import { isHighlighterExtensionUiElement } from './targets';

afterEach(() => {
  document.body.replaceChildren();
});

describe('highlighter hover target ownership', () => {
  it('accepts exact shadow UI and rejects page or host-light-DOM marker lookalikes', () => {
    const host = document.createElement('div');
    host.id = CONTENT_ROOT_ID;
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const ownedTarget = document.createElement('button');
    ownedTarget.className = 'sniptale-frame-toolbar-trigger';
    shadowRoot.append(ownedTarget);
    const pageLookalike = ownedTarget.cloneNode() as HTMLElement;
    document.body.append(pageLookalike);
    const lightDomLookalike = ownedTarget.cloneNode() as HTMLElement;
    host.append(lightDomLookalike);

    expect(isHighlighterExtensionUiElement(ownedTarget)).toBe(true);
    expect(isHighlighterExtensionUiElement(pageLookalike)).toBe(false);
    expect(isHighlighterExtensionUiElement(lightDomLookalike)).toBe(false);
  });
});
