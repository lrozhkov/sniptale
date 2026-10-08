// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackgroundLibraryDrawer } from './library';

vi.mock('../persistence/media-library', () => ({
  listMediaLibrary: async () => [],
  getMediaThumbnail: vi.fn(),
  getMediaAssetBlob: vi.fn(),
}));
vi.mock('../persistence/gallery-saved-views', () => ({ listGallerySavedViews: async () => [] }));

let host: HTMLDivElement;
let parent: HTMLDialogElement;
let trigger: HTMLButtonElement;
let root: Root;
let closedWhileConnected: boolean[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  closedWhileConnected = [];
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
      this.querySelector<HTMLElement>('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      closedWhileConnected.push(this.isConnected);
      this.open = false;
    },
  });
  parent = document.createElement('dialog');
  parent.open = true;
  trigger = document.createElement('button');
  trigger.textContent = 'Library';
  host = document.createElement('div');
  parent.append(trigger, host);
  document.body.append(parent);
  root = createRoot(host);
  trigger.focus();
});
afterEach(async () => {
  await act(async () => root.unmount());
  parent.remove();
  vi.unstubAllGlobals();
});
function Surface() {
  const [open, setOpen] = useState(true);
  return open ? (
    <BackgroundLibraryDrawer
      anchor={host}
      busy={false}
      onSelect={vi.fn()}
      onClose={() => setOpen(false)}
    />
  ) : null;
}
it('closes a nested drawer while connected and restores its trigger after native cancel', async () => {
  expect(document.activeElement).toBe(trigger);
  await act(async () => root.render(<Surface />));
  const drawer = document.querySelector<HTMLDialogElement>('dialog[aria-label]')!;
  expect(drawer.open).toBe(true);
  expect(drawer.contains(document.activeElement)).toBe(true);
  const cancel = new Event('cancel', { cancelable: true });
  await act(async () => drawer.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(drawer.isConnected).toBe(false);
  expect(closedWhileConnected).toEqual([true]);
  expect(document.activeElement).toBe(trigger);
  expect(parent.open).toBe(true);
});
it('does not focus a disconnected trigger when the drawer unmounts', async () => {
  await act(async () => root.render(<Surface />));
  const focus = vi.spyOn(trigger, 'focus');
  trigger.remove();
  await act(async () => root.render(null));
  expect(closedWhileConnected).toEqual([true]);
  expect(focus).not.toHaveBeenCalled();
  expect(parent.open).toBe(true);
});
