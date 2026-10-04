// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMediaItem } from '../actions/test-support';
import { useGalleryDeleteShortcut } from './use-gallery-delete-shortcut';

let root: Root;
let host: HTMLDivElement;
let grid: HTMLDivElement;
const selectedItems = [createMediaItem()];
const onDelete = vi.fn();
const gridRef = { current: null as HTMLDivElement | null };
function Harness({ enabled = true }: { enabled?: boolean }) {
  useGalleryDeleteShortcut({ enabled, selectedItems, gridRef, onDelete });
  return null;
}
function del(target: HTMLElement, overrides: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'Delete',
    bubbles: true,
    cancelable: true,
    ...overrides,
  });
  target.dispatchEvent(event);
  return event;
}
beforeEach(async () => {
  onDelete.mockClear();
  host = document.createElement('div');
  grid = document.createElement('div');
  document.body.append(host, grid);
  gridRef.current = grid;
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  gridRef.current = null;
});

it('opens the common request from the library context with keyboard modality and source anchor', () => {
  const source = document.createElement('button');
  grid.append(source);
  expect(del(source).defaultPrevented).toBe(true);
  expect(onDelete).toHaveBeenCalledExactlyOnceWith(selectedItems, {
    anchor: source,
    keyboard: true,
  });
});

it.each([
  ['input', null],
  ['textarea', null],
  ['select', null],
  ['div', 'listbox'],
  ['div', 'combobox'],
  ['div', 'slider'],
  ['div', 'spinbutton'],
  ['div', 'menu'],
  ['div', 'dialog'],
  ['div', 'tablist'],
  ['div', 'tree'],
])('preserves Delete for %s with role %s', (tag, role) => {
  const control = document.createElement(tag);
  if (role) control.setAttribute('role', role);
  grid.append(control);
  expect(del(control).defaultPrevented).toBe(false);
  expect(onDelete).not.toHaveBeenCalled();
});

it('ignores contenteditable descendants and listbox/menu triggers', () => {
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  const child = document.createElement('span');
  editor.append(child);
  grid.append(editor);
  del(child);
  for (const popup of ['listbox', 'menu']) {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-haspopup', popup);
    grid.append(trigger);
    del(trigger);
  }
  expect(onDelete).not.toHaveBeenCalled();
});

it('ignores handled, composing, modified and repeated key events and controls outside the list', () => {
  const source = document.createElement('button');
  grid.append(source);
  for (const options of [
    { repeat: true },
    { isComposing: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ])
    del(source, options);
  const handled = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
  handled.preventDefault();
  source.dispatchEvent(handled);
  const outside = document.createElement('button');
  document.body.append(outside);
  del(outside);
  expect(onDelete).not.toHaveBeenCalled();
});

it('does not handle Delete while a preview, menu, dialog or blocking operation disables its context', async () => {
  await act(async () => root.render(<Harness enabled={false} />));
  del(document.body);
  expect(onDelete).not.toHaveBeenCalled();
});

it('keeps Delete behind an open menu even when focus is on the list', () => {
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  document.body.append(menu);
  expect(del(grid).defaultPrevented).toBe(false);
  expect(onDelete).not.toHaveBeenCalled();
  menu.remove();
  expect(del(grid).defaultPrevented).toBe(true);
  expect(onDelete).toHaveBeenCalledOnce();
});
