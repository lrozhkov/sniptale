// @vitest-environment jsdom
import { act } from 'react';
import * as domHost from '../../../platform/dom-host';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  registerToolbarMenuEscapeOwner,
  useToolbarMenuState,
  type ToolbarMenuState,
  type ToolbarPopoverMenu,
} from './menu';

const menus: readonly ToolbarPopoverMenu[] = [
  'auto-blur',
  'annotations-export',
  'capture',
  'full-page',
  'frame-style',
  'future-callout',
  'future-step-badge',
  'mode',
  'recording-auto-hide',
  'recording-camera',
  'recording-microphone',
  'recording-spotlight',
  'reset-confirm',
  'settings',
  'timer',
  'viewport',
];
let root: Root;
let host: HTMLDivElement;
let state: ToolbarMenuState;
function Harness() {
  state = useToolbarMenuState();
  return (
    <div className="sniptale-toolbar-root">
      {menus.map((menu) => (
        <button
          key={menu}
          className="sniptale-btn"
          aria-haspopup="menu"
          data-menu={menu}
          onClick={() => state.toggleMenu(menu)}
        >
          {menu}
        </button>
      ))}
      {state.activeMenuType ? <button data-ui="test.menu-item">Menu item</button> : null}
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function trigger(menu: ToolbarPopoverMenu) {
  return host.querySelector<HTMLButtonElement>(`[data-menu="${menu}"]`)!;
}
function key(target: HTMLElement, value: string) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, composed: true, cancelable: true })
    )
  );
}
function open(menu: ToolbarPopoverMenu, keyboard: boolean) {
  const button = trigger(menu);
  if (keyboard) {
    button.focus();
    key(button, 'Enter');
  } else
    act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true })));
  act(() =>
    button.dispatchEvent(
      new MouseEvent('click', { detail: keyboard ? 0 : 1, bubbles: true, composed: true })
    )
  );
  return button;
}
it.each(menus)('%s restores the opening input modality and real focus across reopening', (menu) => {
  for (const keyboard of [false, true, false]) {
    const button = open(menu, keyboard);
    const item = host.querySelector<HTMLButtonElement>('[data-ui="test.menu-item"]')!;
    item.focus();
    key(item, 'Escape');
    expect(state.activeMenuType).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('data-focus-restoration')).toBe(keyboard ? null : 'pointer');
  }
});
it('clears pointer presentation when Tab arrives from outside the toolbar', () => {
  const button = open('settings', false);
  key(button, 'Escape');
  expect(button.getAttribute('data-focus-restoration')).toBe('pointer');
  key(document.body, 'Tab');
  expect(button.hasAttribute('data-focus-restoration')).toBe(false);
});
it('preserves viewport opening across deferred and repeated synchronization', () => {
  const button = document.createElement('button');
  button.className = 'sniptale-btn';
  button.setAttribute('aria-haspopup', 'menu');
  host.querySelector('.sniptale-toolbar-root')?.append(button);
  act(() =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }))
  );
  act(() => {
    state.setViewportMenuOpen(true);
    state.closeMenus('viewport');
  });
  key(button, 'Escape');
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute('data-focus-restoration')).toBe('pointer');
});
it('does not restore an old opening when its Escape callback opens a different menu', () => {
  const old = open('auto-blur', true);
  const next = trigger('settings');
  const unregister = registerToolbarMenuEscapeOwner(() => {
    state.closeMenu('auto-blur');
    state.setActiveMenuType('settings');
    next.focus();
  });
  try {
    key(old, 'Escape');
    expect(state.activeMenuType).toBe('settings');
    expect(document.activeElement).toBe(next);
  } finally {
    unregister();
  }
});
it('does not restore a disabled or disconnected trigger after dismissal', () => {
  for (const remove of [false, true]) {
    const button = open('auto-blur', false);
    const unregister = registerToolbarMenuEscapeOwner(() => {
      state.closeMenu('auto-blur');
      if (remove) button.remove();
      else button.disabled = true;
    });
    try {
      key(document.body, 'Escape');
      expect(document.activeElement).not.toBe(button);
    } finally {
      unregister();
      button.disabled = false;
    }
  }
});

it('captures the non-composed activation bridge within the owned Shadow Root', () => {
  act(() => root.unmount());
  const shadow = host.attachShadow({ mode: 'open' });
  vi.spyOn(domHost, 'resolveContentShadowRoot').mockReturnValue(shadow);
  root = createRoot(shadow);
  act(() => root.render(<Harness />));
  const button = shadow.querySelector<HTMLButtonElement>('[data-menu="auto-blur"]')!;
  act(() => {
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: false }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: false }));
  });
  expect(state.activeMenuType).toBe('auto-blur');
  key(button, 'Escape');
  expect(shadow.activeElement).toBe(button);
  expect(button.getAttribute('data-focus-restoration')).toBe('pointer');
});
