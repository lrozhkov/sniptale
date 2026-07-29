// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../../platform/dom-host';
import { isExtensionUIElement, isNonDataInteractiveElement } from './guards';

afterEach(() => {
  document.body.replaceChildren();
});

function mountContentRoot() {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  return { host, shadowRoot };
}

describe('ai-pick extension UI root guards', () => {
  it('keeps marker-only compatibility before content-root registration', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-ai-pick-hover';

    expect(isExtensionUIElement(target)).toBe(true);
  });

  it('does not treat host-page shadow hosts as extension UI', () => {
    const hostPageComponent = document.createElement('div');
    hostPageComponent.attachShadow({ mode: 'open' });
    document.body.appendChild(hostPageComponent);

    expect(isExtensionUIElement(hostPageComponent)).toBe(false);
  });

  it('treats the content runtime host as extension UI', () => {
    const { host: contentHost } = mountContentRoot();

    expect(isExtensionUIElement(contentHost)).toBe(true);
  });

  it('treats modal-owned descendants as extension UI', () => {
    const { shadowRoot } = mountContentRoot();
    const modal = document.createElement('div');
    modal.classList.add('sniptale-modal');
    const child = document.createElement('button');
    modal.appendChild(child);
    shadowRoot.appendChild(modal);

    expect(isExtensionUIElement(child)).toBe(true);
  });

  it('rejects page lookalikes and exact-host light-DOM children after registration', () => {
    const { host } = mountContentRoot();
    const pageLookalike = document.createElement('div');
    pageLookalike.className = 'sniptale-ai-pick-hover';
    document.body.append(pageLookalike);
    const lightDomLookalike = pageLookalike.cloneNode() as HTMLElement;
    host.append(lightDomLookalike);

    expect(isExtensionUIElement(pageLookalike)).toBe(false);
    expect(isExtensionUIElement(lightDomLookalike)).toBe(false);
  });
});

describe('ai-pick extension UI marker guards', () => {
  it('treats prefixed runtime nodes as extension UI', () => {
    const { shadowRoot } = mountContentRoot();
    const target = document.createElement('div');
    target.className = 'sniptale-custom-node';
    shadowRoot.append(target);

    expect(isExtensionUIElement(target)).toBe(true);
  });

  it('treats ai-pick owned class markers as extension UI', () => {
    const { shadowRoot } = mountContentRoot();
    const target = document.createElement('div');
    target.className = 'sniptale-ai-pick-hover';
    shadowRoot.append(target);

    expect(isExtensionUIElement(target)).toBe(true);
  });

  it('treats ai-pick container markers as extension UI', () => {
    const { shadowRoot } = mountContentRoot();
    const target = document.createElement('div');
    target.className = 'sniptale-ai-pick-container';
    shadowRoot.append(target);

    expect(isExtensionUIElement(target)).toBe(true);
  });
});

describe('ai-pick non-data interactive guards', () => {
  it('treats direct interactive elements as non-data controls', () => {
    const button = document.createElement('button');

    expect(isNonDataInteractiveElement(button)).toBe(true);
  });

  it('treats descendants inside action containers as non-data controls', () => {
    const actions = document.createElement('div');
    actions.className = 'actions';
    const icon = document.createElement('span');
    actions.appendChild(icon);
    document.body.appendChild(actions);

    expect(isNonDataInteractiveElement(icon)).toBe(true);
  });

  it('does not treat plain content nodes as non-data interactive elements', () => {
    const text = document.createElement('span');
    document.body.appendChild(text);

    expect(isNonDataInteractiveElement(text)).toBe(false);
  });
});
