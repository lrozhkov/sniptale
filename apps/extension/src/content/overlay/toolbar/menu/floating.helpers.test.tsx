// @vitest-environment jsdom

import React, { useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import {
  getPointerDistanceFromRect,
  resolveToolbarFloatingMenuStyle,
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
