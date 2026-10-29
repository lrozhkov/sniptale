// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useToolbarMenuState } from '../state/menu';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import {
  getPointerDistanceFromRect,
  resolveToolbarFloatingMenuStyle,
  resolveToolbarDrawingMenuStyle,
  TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX,
  useToolbarFloatingMenuDismissal,
} from './floating.helpers';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function DismissalHarness(props: { onClose: () => void; onFarPointerClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useToolbarFloatingMenuDismissal({
    closeOnFarPointer: true,
    menuRef,
    onClose: props.onClose,
    onFarPointerClose: props.onFarPointerClose,
    open: true,
    triggerRef,
  });
  return (
    <>
      <button ref={triggerRef}>Trigger</button>
      <div ref={menuRef} data-ui="test.toolbar-menu-host">
        <ProductToolbarMenu variant="capture">Menu</ProductToolbarMenu>
      </div>
    </>
  );
}

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('uses the shared 250px pointer distance policy', () => {
  const rect = {
    bottom: 200,
    height: 100,
    left: 100,
    right: 300,
    top: 100,
    width: 200,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect;

  expect(TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX).toBe(250);
  expect(
    getPointerDistanceFromRect(new MouseEvent('mousemove', { clientX: 340, clientY: 220 }), rect)
  ).toBeLessThan(TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX);
  expect(
    getPointerDistanceFromRect(new MouseEvent('mousemove', { clientX: 620, clientY: 520 }), rect)
  ).toBeGreaterThan(TOOLBAR_MENU_POINTER_DISMISS_DISTANCE_PX);
});

it('keeps floating menu placement in the same physical viewport under page zoom', () => {
  vi.stubGlobal('innerWidth', 500);
  vi.stubGlobal('innerHeight', 400);
  const owner = document.createElement('div');
  owner.style.setProperty('--sniptale-content-ui-scale', '0.5');
  const anchor = document.createElement('button');
  owner.append(anchor);
  document.body.append(owner);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
    bottom: 70,
    height: 20,
    left: 50,
    right: 68,
    top: 50,
    width: 18,
    x: 50,
    y: 50,
    toJSON: () => ({}),
  });

  expect(
    resolveToolbarFloatingMenuStyle({
      anchorEl: anchor,
      menuWidth: 300,
      placement: 'down',
    })
  ).toMatchObject({ left: 0, top: 'calc(100% + 10px)' });
});

it.each(['sniptale-toolbar', 'sniptale-selection-toolbar'])(
  'anchors drawing ribbons to the visible shell and button for %s',
  (className) => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('innerHeight', 600);
    const toolbar = document.createElement('div');
    toolbar.className = className;
    const anchor = document.createElement('button');
    toolbar.append(anchor);
    document.body.append(toolbar);
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 300, 500, 50));
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 309, 32, 32));
    expect(
      resolveToolbarDrawingMenuStyle({
        anchorEl: anchor,
        menuWidth: 400,
        menuHeight: 60,
        placement: 'up',
        surfaceInset: 8,
      })
    ).toMatchObject({ left: -8, top: 'auto', bottom: 34, maxHeight: 307 });
    expect(
      resolveToolbarDrawingMenuStyle({
        anchorEl: anchor,
        menuWidth: 400,
        menuHeight: 60,
        placement: 'up',
      })
    ).toMatchObject({ left: 0, top: 'auto', bottom: 42, maxHeight: 291 });
    expect(
      resolveToolbarDrawingMenuStyle({
        anchorEl: anchor,
        menuWidth: 400,
        menuHeight: 600,
        placement: 'down',
        surfaceInset: 8,
      })
    ).toMatchObject({ left: -8, top: 34, bottom: 'auto', maxHeight: 257, overflowY: 'auto' });
  }
);

it.each([0, 8])('keeps vertical drawing surfaces aligned with inset %s', (surfaceInset) => {
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 600);
  const toolbar = document.createElement('div');
  toolbar.className = 'sniptale-toolbar';
  const anchor = document.createElement('button');
  toolbar.append(anchor);
  document.body.append(toolbar);
  const shell = vi.spyOn(toolbar, 'getBoundingClientRect');
  const trigger = vi.spyOn(anchor, 'getBoundingClientRect');
  for (const x of [8, 942]) {
    shell.mockReturnValue(new DOMRect(x, 100, 50, 300));
    trigger.mockReturnValue(new DOMRect(x + 9, 200, 32, 32));
    const style = resolveToolbarDrawingMenuStyle({
      anchorEl: anchor,
      displayMode: 'vertical',
      menuWidth: 190 + 2 * surfaceInset,
      menuHeight: 200 + 2 * surfaceInset,
      placement: 'down',
      surfaceInset,
    })!;
    const left =
      (style.left === 'auto'
        ? x + 41 - Number(style.right) - 190 - surfaceInset * 2
        : Number(style.left) + x + 9) + surfaceInset;
    expect(x === 8 ? left - x - 50 : x - left - 190).toBe(1);
    expect(Number(style.top) + 200 + surfaceInset).toBe(200);
  }
});

it('keeps a floating menu open nearby and uses the non-focus close path far away', () => {
  const onClose = vi.fn();
  const onFarPointerClose = vi.fn();
  const view = render(<DismissalHarness onClose={onClose} onFarPointerClose={onFarPointerClose} />);
  const popover = view.querySelector<HTMLElement>('[data-ui="test.toolbar-menu-host"]')
    ?.firstElementChild as HTMLElement | null;
  vi.spyOn(popover!, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 100,
    left: 100,
    right: 300,
    top: 100,
    width: 200,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });

  act(() => {
    document.body.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 340, clientY: 220 })
    );
  });
  expect(onFarPointerClose).not.toHaveBeenCalled();

  act(() => {
    document.body.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 620, clientY: 520 })
    );
  });
  expect(onFarPointerClose).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
});

function EscapeHarness(props: { onClose: () => void; onEscapeClose?: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuState = useToolbarMenuState();
  useToolbarFloatingMenuDismissal({
    open: menuState.activeMenuType !== null,
    menuRef,
    triggerRef,
    onClose: props.onClose,
    onEscapeClose: props.onEscapeClose,
  });
  return (
    <>
      <button ref={triggerRef} onClick={() => menuState.toggleMenu('reset-confirm')}>
        Open
      </button>
      <div ref={menuRef}>
        Menu
        <span data-floating-ui-owner-id="test-picker-owner" />
      </div>
    </>
  );
}

it('routes shared capture Escape separately from ordinary dismissal', () => {
  const onClose = vi.fn();
  const onEscapeClose = vi.fn();
  const host = render(<EscapeHarness onClose={onClose} onEscapeClose={onEscapeClose} />);
  act(() => host.querySelector('button')?.click());
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onEscapeClose).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  act(() => host.querySelector('button')?.click());
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onClose).toHaveBeenCalledOnce();
});

it('retains onClose as the shared Escape fallback', () => {
  const onClose = vi.fn();
  const host = render(<EscapeHarness onClose={onClose} />);
  act(() => host.querySelector('button')?.click());
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalledOnce();
});

it('keeps an owned picker interaction inside the menu and defers Escape until it closes', () => {
  const onClose = vi.fn();
  const host = render(<EscapeHarness onClose={onClose} />);
  act(() => host.querySelector('button')?.click());
  const layer = document.createElement('div');
  layer.setAttribute('data-floating-ui-owned-by', 'test-picker-owner');
  const input = document.createElement('input');
  layer.append(input);
  document.body.append(layer);
  act(() => input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  act(() => input.focus());
  expect(onClose).not.toHaveBeenCalled();
  const closePicker = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopImmediatePropagation();
    layer.remove();
  };
  document.addEventListener('keydown', closePicker, true);
  try {
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(layer.isConnected).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    document.removeEventListener('keydown', closePicker, true);
    layer.remove();
  }
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalledOnce();
});

it.each([
  [100, 300, -16],
  [10, 300, -2],
  [600, 300, -140],
])('clamps the preferred vertical offset at anchor y=%s', (y, menuHeight, expectedTop) => {
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 768);
  const anchor = document.createElement('button');
  document.body.append(anchor);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, y, 36, 36));
  expect(
    resolveToolbarFloatingMenuStyle({
      anchorEl: anchor,
      displayMode: 'vertical',
      menuHeight,
      menuWidth: 190,
      placement: 'down',
      preferredTop: -16,
    })
  ).toMatchObject({ top: expectedTop });
});

it.each([
  ['videoRecording', 8],
  ['videoRecording', 934],
  ['pageControls', 8],
  ['pageControls', 934],
] as const)('keeps %s menus outside the scrolling vertical toolbar at x=%s', (owner, x) => {
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 560);
  const toolbar = document.createElement('div');
  toolbar.className = 'sniptale-toolbar';
  toolbar.dataset[owner] = 'true';
  const anchor = document.createElement('button');
  toolbar.append(anchor);
  document.body.append(toolbar);
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, 8, 58, 544));
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(x + 8, 350, 32, 32));
  const style = resolveToolbarFloatingMenuStyle({
    anchorEl: anchor,
    displayMode: 'vertical',
    placement: 'down',
    menuWidth: 320,
    menuHeight: 360,
  });
  expect(style).toMatchObject({ position: 'fixed', bottom: 'auto' });
  if (x === 8) {
    expect(style?.right).toBe('auto');
    expect(Number(style?.left)).toBeGreaterThanOrEqual(x + 58 + 1);
  } else {
    expect(style?.left).toBe('auto');
    expect(1000 - Number(style?.right)).toBeLessThanOrEqual(x - 1);
  }
  expect(Number(style?.top)).toBeGreaterThanOrEqual(8);
  expect(Number(style?.top) + 360).toBeLessThanOrEqual(552);
});

it.each([1, 0.5, 1.5])(
  'keeps fixed vertical menu gap independent of classic scrollbar at scale %s',
  (scale) => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 700);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1183);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(700);
    const toolbar = document.createElement('div');
    toolbar.className = 'sniptale-toolbar';
    toolbar.dataset['pageControls'] = 'true';
    toolbar.style.setProperty('--sniptale-content-ui-scale', String(scale));
    const anchor = document.createElement('button');
    toolbar.append(anchor);
    document.body.append(toolbar);
    const x = 1183 - 20 * scale - 50 * scale;
    vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(x, 100, 50 * scale, 300 * scale)
    );
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(x + 9 * scale, 150, 32 * scale, 32 * scale)
    );
    const style = resolveToolbarDrawingMenuStyle({
      anchorEl: anchor,
      displayMode: 'vertical',
      menuWidth: 190,
      menuHeight: 200,
      placement: 'down',
    })!;
    const menuRight = 1183 - Number(style.right) * scale;
    expect(x - menuRight).toBeCloseTo(scale, 6);
  }
);
