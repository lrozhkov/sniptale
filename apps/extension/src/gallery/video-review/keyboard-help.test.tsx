// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReviewKeyboardHelp } from './keyboard-help';
import { translate } from '../../platform/i18n';

let host: HTMLDivElement;
let root: Root;
const show = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
});
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  show.mockClear();
  close.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: close });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  for (const [name, descriptor] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function trigger() {
  return host.querySelector<HTMLButtonElement>('[data-ui="gallery.videoReview.moreActions"]')!;
}
function item(key: Parameters<typeof translate>[0]) {
  const result = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === translate(key)
  );
  if (!result) throw new Error(`Missing menu item: ${key}`);
  return result;
}
function key(value: string) {
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: value,
        bubbles: true,
        cancelable: true,
      })
    )
  );
}
function open() {
  act(() => trigger().click());
}

it('opens help through More as a native modal and restores the utility trigger after cancellation', () => {
  act(() => root.render(<ReviewKeyboardHelp />));
  open();
  expect(show).not.toHaveBeenCalled();
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  act(() => item('gallery.keyboard.title').click());
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(show).toHaveBeenCalledOnce();
  const dialog = host.querySelector('dialog')!;
  expect(dialog.textContent).toContain('F6');
  expect(dialog.textContent).not.toContain('Enter / Space');
  act(() =>
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    )
  );
  expect(dialog.contains(document.activeElement)).toBe(true);
  act(() => dialog.dispatchEvent(new Event('cancel', { cancelable: true })));
  expect(host.querySelector('dialog')).toBeNull();
  expect(close).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger());
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
});

it('navigates available utility commands with arrows and returns focus on Escape or Tab', () => {
  act(() => root.render(<ReviewKeyboardHelp onNewProject={vi.fn()} onBackup={vi.fn()} />));
  act(() => trigger().focus());
  key('ArrowUp');
  expect(document.activeElement).toBe(item('gallery.app.selectionBackup'));
  key('Home');
  expect(document.activeElement).toBe(item('videoEditor.app.newProjectAction'));
  key('ArrowDown');
  expect(document.activeElement).toBe(item('gallery.keyboard.title'));
  key('End');
  expect(document.activeElement).toBe(item('gallery.app.selectionBackup'));
  key('ArrowDown');
  expect(document.activeElement).toBe(item('videoEditor.app.newProjectAction'));
  key('Escape');
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  key('ArrowDown');
  key('Tab');
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

it('calls each project command once and leaves only help available while busy', () => {
  const onNewProject = vi.fn(),
    onBackup = vi.fn();
  const render = (busy = false) =>
    root.render(<ReviewKeyboardHelp {...{ busy, onNewProject, onBackup }} />);
  act(() => render());
  expect(host.querySelector('[data-ui="gallery.videoReview.newProject"]')).toBeNull();
  open();
  act(() => item('videoEditor.app.newProjectAction').click());
  expect(onNewProject).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger());
  open();
  act(() => item('gallery.app.selectionBackup').click());
  expect(onBackup).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  act(() => render(true));
  open();
  const create = item('videoEditor.app.newProjectAction'),
    backup = item('gallery.app.selectionBackup');
  expect(create.disabled).toBe(true);
  expect(backup.disabled).toBe(true);
  act(() => {
    create.click();
    backup.click();
  });
  expect(onNewProject).toHaveBeenCalledOnce();
  expect(onBackup).toHaveBeenCalledOnce();
  key('Home');
  expect(document.activeElement).toBe(item('gallery.keyboard.title'));
  act(() => item('gallery.keyboard.title').click());
  expect(show).toHaveBeenCalledOnce();
});

it('closes the menu on an outside pointer action without stealing outside focus', () => {
  act(() => root.render(<ReviewKeyboardHelp />));
  open();
  act(() => document.body.focus());
  act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).not.toBe(trigger());
});
