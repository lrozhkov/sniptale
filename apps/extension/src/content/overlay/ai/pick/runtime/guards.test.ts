// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { isExtensionUIElement, isNonDataInteractiveElement } from './guards';

afterEach(() => {
  document.body.replaceChildren();
});

describe('ai-pick extension UI root guards', () => {
  it('does not treat host-page shadow hosts as extension UI', () => {
    const hostPageComponent = document.createElement('div');
    hostPageComponent.attachShadow({ mode: 'open' });
    document.body.appendChild(hostPageComponent);

    expect(isExtensionUIElement(hostPageComponent)).toBe(false);
  });

  it('treats the content runtime host as extension UI', () => {
    const contentHost = document.createElement('div');
    contentHost.id = CONTENT_ROOT_ID;
    contentHost.attachShadow({ mode: 'open' });
    document.body.appendChild(contentHost);

    expect(isExtensionUIElement(contentHost)).toBe(true);
  });

  it('treats modal-owned descendants as extension UI', () => {
    const modal = document.createElement('div');
    modal.classList.add('sniptale-modal');
    const child = document.createElement('button');
    modal.appendChild(child);
    document.body.appendChild(modal);

    expect(isExtensionUIElement(child)).toBe(true);
  });
});

describe('ai-pick extension UI marker guards', () => {
  it('treats prefixed runtime nodes as extension UI', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-custom-node';

    expect(isExtensionUIElement(target)).toBe(true);
  });

  it('treats ai-pick owned class markers as extension UI', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-ai-pick-hover';

    expect(isExtensionUIElement(target)).toBe(true);
  });

  it('treats ai-pick container markers as extension UI', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-ai-pick-container';

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
