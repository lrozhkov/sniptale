// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../platform/dom-host';
import { isSelectionModeExtensionUiElement } from './extension-ui';

afterEach(() => {
  document.body.replaceChildren();
});

function runTooltipOwnershipTests() {
  it('treats shared size tooltip descendants as extension UI', () => {
    const tooltip = document.createElement('div');
    tooltip.className = 'sniptale-content-size-tooltip';
    const child = document.createElement('button');
    tooltip.appendChild(child);
    document.body.appendChild(tooltip);

    expect(isSelectionModeExtensionUiElement(child)).toBe(true);
  });

  it('treats shared size tooltip descendants inside selection wrappers as extension UI', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'sniptale-selection-shell';
    const tooltip = document.createElement('div');
    tooltip.className = 'sniptale-content-size-tooltip';
    const child = document.createElement('span');
    tooltip.appendChild(child);
    wrapper.appendChild(tooltip);
    document.body.appendChild(wrapper);

    expect(isSelectionModeExtensionUiElement(child)).toBe(true);
  });
}

function runSelectionOwnershipTests() {
  it('treats selection-owned prefixed nodes as extension UI', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-selection-frame';

    expect(isSelectionModeExtensionUiElement(target)).toBe(true);
  });

  it('treats descendants inside selection-owned wrappers as extension UI', () => {
    const container = document.createElement('div');
    container.className = 'foo sniptale-selection-overlay bar';
    const child = document.createElement('button');
    container.appendChild(child);
    document.body.appendChild(container);

    expect(isSelectionModeExtensionUiElement(child)).toBe(true);
  });

  it('treats direct selection-owned descendants as extension UI through closest matching', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'foo sniptale-selection-toolbar';
    const child = document.createElement('span');
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);

    expect(isSelectionModeExtensionUiElement(child)).toBe(true);
  });
}

function runContentHostTests() {
  it('treats content-owned descendants as extension UI', () => {
    const contentRoot = document.createElement('div');
    contentRoot.id = CONTENT_ROOT_ID;
    const shadowRoot = contentRoot.attachShadow({ mode: 'open' });
    initializeContentUiRoots(shadowRoot);
    const child = document.createElement('button');
    shadowRoot.appendChild(child);
    document.body.appendChild(contentRoot);

    expect(isSelectionModeExtensionUiElement(child)).toBe(true);
  });

  it('rejects page markers and exact-host light-DOM children after registration', () => {
    const contentRoot = document.createElement('div');
    contentRoot.id = CONTENT_ROOT_ID;
    document.body.append(contentRoot);
    initializeContentUiRoots(contentRoot.attachShadow({ mode: 'open' }));
    const target = document.createElement('div');
    target.className = 'sniptale-selection-frame';
    document.body.appendChild(target);
    const lightDomTarget = target.cloneNode() as HTMLElement;
    contentRoot.append(lightDomTarget);

    expect(isSelectionModeExtensionUiElement(target)).toBe(false);
    expect(isSelectionModeExtensionUiElement(lightDomTarget)).toBe(false);
  });
}

describe('selection-mode extension ui', () => {
  runTooltipOwnershipTests();
  runSelectionOwnershipTests();
  runContentHostTests();
});
