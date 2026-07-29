// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../dom-host';
import {
  applyContentRuntimeTheme,
  createContentRuntimeUiGuard,
  isContentRuntimeUiElement,
} from './dom';

function mountContentRoot(theme: 'light' | 'dark' = 'light') {
  const host = document.createElement('div');
  host.id = CONTENT_ROOT_ID;
  host.setAttribute('data-theme', theme);
  document.body.append(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  initializeContentUiRoots(shadowRoot);
  return { host, shadowRoot };
}

describe('content-runtime dom helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.body.removeAttribute('data-theme');
  });

  it('keeps marker-only compatibility before content-root registration', () => {
    const target = document.createElement('div');
    target.className = 'sniptale-selection-overlay';

    expect(
      isContentRuntimeUiElement(target, {
        classPrefixes: ['sniptale-selection-'],
      })
    ).toBe(true);
  });

  it('applies theme only from the exact registered content host', () => {
    const lookalike = document.createElement('div');
    lookalike.id = CONTENT_ROOT_ID;
    lookalike.setAttribute('data-theme', 'dark');
    document.body.append(lookalike);
    mountContentRoot('light');
    const container = document.createElement('div');

    applyContentRuntimeTheme(container);

    expect(container.getAttribute('data-theme')).toBe('light');
    expect(container.style.colorScheme).toBe('light');
  });

  it('does not inherit page theme after the registered host retires', () => {
    const { host } = mountContentRoot('light');
    host.remove();
    document.body.append(host);
    document.body.setAttribute('data-theme', 'dark');
    const container = document.createElement('div');
    container.setAttribute('data-theme', 'light');
    container.style.colorScheme = 'light';

    applyContentRuntimeTheme(container);

    expect(container.hasAttribute('data-theme')).toBe(false);
    expect(container.style.colorScheme).toBe('');
  });

  it('requires exact root ownership before matching configured classes and selectors', () => {
    const { host, shadowRoot } = mountContentRoot();
    const ownedWrapper = document.createElement('div');
    ownedWrapper.className = 'sniptale-selection-shell';
    const ownedTarget = document.createElement('button');
    ownedTarget.className = 'sniptale-content-size-tooltip';
    ownedWrapper.append(ownedTarget);
    shadowRoot.append(ownedWrapper);

    const pageLookalike = ownedTarget.cloneNode() as HTMLElement;
    document.body.append(pageLookalike);
    const lightDomLookalike = ownedTarget.cloneNode() as HTMLElement;
    host.append(lightDomLookalike);

    const options = {
      classPrefixes: ['sniptale-selection-'],
      closestSelectors: ['.sniptale-content-size-tooltip'],
    };
    expect(isContentRuntimeUiElement(ownedTarget, options)).toBe(true);
    expect(isContentRuntimeUiElement(pageLookalike, options)).toBe(false);
    expect(isContentRuntimeUiElement(lightDomLookalike, options)).toBe(false);
  });

  it('keeps exact owned portal and runtime-tree descendants actionable', () => {
    const { shadowRoot } = mountContentRoot();
    const portal = document.createElement('div');
    const portalChild = document.createElement('button');
    portal.append(portalChild);
    const runtimeOwner = document.createElement('div');
    runtimeOwner.className = 'sniptale-app';
    const runtimeChild = document.createElement('span');
    runtimeOwner.append(runtimeChild);
    shadowRoot.append(portal, runtimeOwner);

    expect(isContentRuntimeUiElement(portalChild, { portalElements: [portal] })).toBe(true);
    expect(isContentRuntimeUiElement(runtimeChild)).toBe(true);
  });

  it('builds guards that retain the exact ownership gate', () => {
    const { host, shadowRoot } = mountContentRoot();
    const guard = createContentRuntimeUiGuard({
      classPrefixes: ['sniptale-selection-'],
    });
    const ownedTarget = document.createElement('div');
    ownedTarget.className = 'sniptale-selection-overlay';
    shadowRoot.append(ownedTarget);
    const pageLookalike = ownedTarget.cloneNode() as HTMLElement;
    const lightDomLookalike = ownedTarget.cloneNode() as HTMLElement;
    document.body.append(pageLookalike);
    host.append(lightDomLookalike);

    expect(guard(ownedTarget)).toBe(true);
    expect(guard(pageLookalike)).toBe(false);
    expect(guard(lightDomLookalike)).toBe(false);
  });
});
