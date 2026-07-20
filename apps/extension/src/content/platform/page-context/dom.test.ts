// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  applyContentRuntimeTheme,
  createContentRuntimeUiGuard,
  isContentRuntimeUiElement,
} from './dom';

function runThemeTests() {
  it('applies the owning portal theme to a runtime container', () => {
    const themeOwner = document.createElement('div');
    themeOwner.id = CONTENT_ROOT_ID;
    themeOwner.setAttribute('data-theme', 'dark');
    document.body.append(themeOwner);

    const container = document.createElement('div');
    applyContentRuntimeTheme(container);

    expect(container.getAttribute('data-theme')).toBe('dark');
    expect(container.style.colorScheme).toBe('dark');
  });
}

function runRuntimeUiTests() {
  it('matches runtime ui elements through prefixes, selectors, portals, and runtime ownership', () => {
    const portal = document.createElement('div');
    const portalChild = document.createElement('button');
    portal.append(portalChild);
    document.body.append(portal);

    const prefixed = document.createElement('div');
    prefixed.className = 'sniptale-selection-frame';

    const selectable = document.createElement('div');
    selectable.innerHTML = '<button class="sniptale-content-size-tooltip">ok</button>';
    const selectableChild = selectable.querySelector('button') as HTMLElement;

    const runtimeOwner = document.createElement('div');
    runtimeOwner.className = 'sniptale-app';
    const runtimeChild = document.createElement('span');
    runtimeOwner.append(runtimeChild);
    document.body.append(runtimeOwner);

    expect(
      isContentRuntimeUiElement(prefixed, {
        classPrefixes: ['sniptale-selection-'],
      })
    ).toBe(true);
    expect(
      isContentRuntimeUiElement(selectableChild, {
        closestSelectors: ['.sniptale-content-size-tooltip'],
      })
    ).toBe(true);
    expect(
      isContentRuntimeUiElement(portalChild, {
        portalElements: [portal],
      })
    ).toBe(true);
    expect(isContentRuntimeUiElement(runtimeChild)).toBe(true);
  });
}

function runGuardFactoryTests() {
  it('builds reusable runtime ui guards from static ownership options', () => {
    const guard = createContentRuntimeUiGuard({
      classPrefixes: ['sniptale-selection-'],
    });
    const target = document.createElement('div');
    target.className = 'sniptale-selection-overlay';

    expect(guard(target)).toBe(true);
  });
}

describe('content-runtime dom helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  runThemeTests();
  runRuntimeUiTests();
  runGuardFactoryTests();
});
