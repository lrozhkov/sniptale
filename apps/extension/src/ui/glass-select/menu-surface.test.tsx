// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlassSelectMenuSurface } from './menu-surface';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSurface(props: React.ComponentProps<typeof GlassSelectMenuSurface>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<GlassSelectMenuSurface {...props}>option</GlassSelectMenuSurface>);
  });

  return container.querySelector<HTMLDivElement>('[role="listbox"]');
}

function expectAnchoredMenuClasses() {
  const menu = renderSurface({
    portal: false,
    portalTheme: null,
    portalStyle: {},
    menuPosition: 'top',
    menuSizeClasses: 'min-w-[10rem]',
    menuClassName: 'menu-extra',
    menuSurfaceClassName: 'surface-shell',
    menuRef: { current: null },
  });

  expect(menu?.dataset['ui']).toBe('shared.ui.glass-select.menu');
  expect(menu?.dataset['theme']).toBeUndefined();
  expect(menu?.className).toContain('absolute z-50 left-0 w-full');
  expect(menu?.className).toContain('bottom-full mb-2');
  expect(menu?.className).toContain('surface-shell');
  expect(menu?.className).toContain('menu-extra');
  expect(menu?.style.colorScheme).toBe('');
}

function expectPortalMenuClasses() {
  const menu = renderSurface({
    portal: true,
    portalTheme: 'dark',
    portalStyle: { left: 24, top: 48, width: 320 },
    menuPosition: 'bottom',
    menuSizeClasses: 'min-w-[12rem]',
    menuClassName: 'portal-extra',
    menuSurfaceClassName: 'portal-shell',
    menuRef: { current: null },
  });

  expect(menu?.dataset['ui']).toBe('shared.ui.glass-select.portal-surface');
  expect(menu?.dataset['theme']).toBe('dark');
  expect(menu?.className).not.toContain('absolute z-50 left-0 w-full');
  expect(menu?.className).toContain('portal-shell');
  expect(menu?.className).toContain('portal-extra');
  expect(menu?.style.left).toBe('24px');
  expect(menu?.style.top).toBe('48px');
  expect(menu?.style.width).toBe('320px');
  expect(menu?.style.colorScheme).toBe('dark');
}

function expectHiddenPortalMenuUntilPositioned() {
  const menu = renderSurface({
    portal: true,
    portalTheme: 'dark',
    portalStyle: {},
    menuPosition: 'bottom',
    menuSizeClasses: 'min-w-[12rem]',
    menuClassName: 'portal-extra',
    menuSurfaceClassName: 'portal-shell',
    menuRef: { current: null },
  });

  expect(menu?.style.visibility).toBe('hidden');
  expect(menu?.style.pointerEvents).toBe('none');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GlassSelectMenuSurface', () => {
  it('renders anchored menu classes for non-portal placement', expectAnchoredMenuClasses);
  it('renders portal menu classes and theme-scoped style', expectPortalMenuClasses);
  it(
    'keeps a portal menu hidden until floating coordinates are available',
    expectHiddenPortalMenuUntilPositioned
  );
});
