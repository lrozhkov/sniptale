// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGalleryLibraryShortcuts } from './use-library-shortcuts';
let root: Root;
let host: HTMLDivElement;
let grid: HTMLDivElement;
let search: HTMLInputElement;
const onSelectAll = vi.fn();
const onClearSelection = vi.fn();
const gridRef = { current: null as HTMLDivElement | null };
const searchRef = { current: null as HTMLInputElement | null };
function Harness({
  enabled = true,
  selectedCount = 2,
}: {
  enabled?: boolean;
  selectedCount?: number;
}) {
  useGalleryLibraryShortcuts({
    enabled,
    selectedCount,
    gridRef,
    searchRef,
    onSelectAll,
    onClearSelection,
  });
  return null;
}
function key(target: HTMLElement, key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { platform: 'Win32', userAgent: '' });
  host = document.createElement('div');
  grid = document.createElement('div');
  grid.tabIndex = -1;
  search = document.createElement('input');
  search.value = 'current query';
  document.body.append(host, grid, search);
  gridRef.current = grid;
  searchRef.current = search;
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  gridRef.current = null;
  searchRef.current = null;
  vi.unstubAllGlobals();
});
it('routes current-result selection and deselection once for each supported platform', () => {
  expect(key(grid, 'a', { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(onSelectAll).toHaveBeenCalledOnce();
  vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
  expect(key(grid, 'ф', { code: 'KeyA', metaKey: true }).defaultPrevented).toBe(true);
  expect(onSelectAll).toHaveBeenCalledTimes(2);
  expect(key(grid, 'Escape').defaultPrevented).toBe(true);
  expect(onClearSelection).toHaveBeenCalledOnce();
});
it('focuses and selects the existing Library or Trash query without changing its value', () => {
  expect(key(grid, 'f', { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(search);
  expect(search.selectionStart).toBe(0);
  expect(search.selectionEnd).toBe(search.value.length);
  search.setSelectionRange(3, 4);
  key(search, 'f', { ctrlKey: true });
  expect(search.selectionStart).toBe(0);
  expect(search.value).toBe('current query');
  expect(onClearSelection).not.toHaveBeenCalled();
  vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' });
  grid.focus();
  key(grid, 'а', { code: 'KeyF', metaKey: true });
  expect(document.activeElement).toBe(search);
});
it('leaves text input, outside controls and controls with their own keyboard behavior alone', () => {
  const outside = document.createElement('button');
  document.body.append(outside);
  for (const target of [search, outside]) {
    expect(key(target, 'a', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(target, 'Escape').defaultPrevented).toBe(false);
  }
  for (const tag of ['input', 'textarea', 'select']) {
    const control = document.createElement(tag);
    grid.append(control);
    expect(key(control, 'f', { ctrlKey: true }).defaultPrevented).toBe(false);
  }
  expect(onSelectAll).not.toHaveBeenCalled();
  expect(onClearSelection).not.toHaveBeenCalled();
});
it('does not clear selection when the same Escape closes a higher layer', () => {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  const close = () => menu.remove();
  document.addEventListener('keydown', close, { once: true });
  expect(key(document.body, 'Escape').defaultPrevented).toBe(false);
  expect(menu.isConnected).toBe(false);
  expect(onClearSelection).not.toHaveBeenCalled();
  key(grid, 'Escape');
  expect(onClearSelection).toHaveBeenCalledOnce();
});
it('blocks commands for dialogs and unavailable workflows and releases listeners on unmount', async () => {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  document.body.append(dialog);
  key(grid, 'a', { ctrlKey: true });
  key(grid, 'f', { ctrlKey: true });
  key(grid, 'Escape');
  expect(onSelectAll).not.toHaveBeenCalled();
  expect(onClearSelection).not.toHaveBeenCalled();
  dialog.remove();
  await act(async () => root.render(<Harness enabled={false} />));
  key(grid, 'a', { ctrlKey: true });
  expect(onSelectAll).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  key(grid, 'a', { ctrlKey: true });
  expect(onSelectAll).not.toHaveBeenCalled();
  root = createRoot(host);
});
it('ignores repeated, composing, handled and wrong modifier commands', () => {
  for (const options of [
    { repeat: true },
    { isComposing: true },
    { altKey: true },
    { shiftKey: true },
    { metaKey: true },
    { ctrlKey: true, metaKey: true },
  ]) {
    key(grid, 'a', { ctrlKey: true, ...options });
    key(grid, 'f', { ctrlKey: true, ...options });
  }
  const handled = new KeyboardEvent('keydown', {
    key: 'a',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  handled.preventDefault();
  grid.dispatchEvent(handled);
  expect(onSelectAll).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(search);
});
it('leaves empty selection Escape available to other list behavior', async () => {
  await act(async () => root.render(<Harness selectedCount={0} />));
  expect(key(grid, 'Escape').defaultPrevented).toBe(false);
  expect(onClearSelection).not.toHaveBeenCalled();
});
