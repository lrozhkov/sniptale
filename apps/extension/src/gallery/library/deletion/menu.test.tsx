// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { GalleryDeletionMenu } from './menu';
import type { GalleryDeletionRequest } from './types';

let root: Root;
let container: HTMLDivElement;
let anchor: HTMLButtonElement;
let request: GalleryDeletionRequest;
let onClose: ReturnType<typeof vi.fn<() => void>>;
let confirm: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

beforeEach(() => {
  container = document.createElement('div');
  anchor = document.createElement('button');
  document.body.append(container, anchor);
  root = createRoot(container);
  confirm = vi.fn(async () => true);
  onClose = vi.fn();
  request = {
    anchor,
    keyboard: true,
    contextKey: 'current',
    targets: [],
    moveToTrash: vi.fn(async () => true),
    preparePermanent: vi.fn(async () => ({ warning: 'Cannot be undone', confirm })),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
async function render(contextKey = 'current') {
  await act(async () =>
    root.render(<GalleryDeletionMenu request={request} contextKey={contextKey} onClose={onClose} />)
  );
}
function button(label: Parameters<typeof translate>[0]): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === translate(label)
  );
  if (!match) throw new Error(`Missing menu control: ${label}`);
  return match;
}
async function click(control: HTMLButtonElement, detail = 1) {
  await act(async () => control.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })));
}

it('shows irreversible consequences only after choosing permanent deletion', async () => {
  await render();
  expect(document.body.textContent).not.toContain(translate('gallery.app.permanentDeleteConfirm'));
  expect(button('gallery.app.permanentDelete').hasAttribute('aria-describedby')).toBe(false);
  await click(button('gallery.app.permanentDelete'));
  expect(document.querySelector('[role="status"]')?.textContent).toBe('Cannot be undone');
  expect(button('gallery.app.confirmPermanentDelete').getAttribute('aria-describedby')).toBe(
    document.querySelector('[role="status"]')?.id
  );
});

it('defaults keyboard focus to reversible deletion and executes it without another confirmation', async () => {
  await render();
  const move = button('gallery.app.moveToTrash');
  expect(document.activeElement).toBe(move);
  await click(move);
  expect(request.moveToTrash).toHaveBeenCalledOnce();
  expect(request.preparePermanent).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(anchor);
});

it('requires a second explicit permanent activation and ignores the double-click continuation', async () => {
  await render();
  const permanent = button('gallery.app.permanentDelete');
  await click(permanent);
  expect(request.preparePermanent).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
  const armed = button('gallery.app.confirmPermanentDelete');
  await click(armed, 2);
  expect(confirm).not.toHaveBeenCalled();
  await click(armed);
  expect(confirm).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

it('offers only confirmed permanent deletion in Trash and preserves the menu after failure', async () => {
  request.moveToTrash = null;
  confirm.mockResolvedValue(false);
  await render();
  expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
  expect(document.activeElement).toBe(button('gallery.app.permanentDelete'));
  await click(button('gallery.app.permanentDelete'));
  await click(button('gallery.app.confirmPermanentDelete'));
  expect(onClose).not.toHaveBeenCalled();
});

it('consumes Escape before the preview handler and discards a late preparation', async () => {
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof request.preparePermanent>>>();
  request.preparePermanent = vi.fn(() => gate.promise);
  await render();
  await click(button('gallery.app.permanentDelete'));
  const previewEscape = vi.fn();
  window.addEventListener('keydown', previewEscape);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
  );
  window.removeEventListener('keydown', previewEscape);
  expect(previewEscape).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
  gate.resolve({ warning: 'late', confirm });
  await act(async () => {
    await gate.promise;
  });
  expect(confirm).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('late');
});

it('does not prepare twice while a request is pending and cancels when selection changes', async () => {
  const gate = Promise.withResolvers<null>();
  request.preparePermanent = vi.fn(() => gate.promise);
  await render();
  const permanent = button('gallery.app.permanentDelete');
  await click(permanent);
  await click(permanent);
  expect(request.preparePermanent).toHaveBeenCalledOnce();
  await render('changed-selection');
  expect(onClose).toHaveBeenCalledOnce();
  gate.resolve(null);
  await act(async () => {
    await gate.promise;
  });
  expect(confirm).not.toHaveBeenCalled();
});

it('restores the trigger when a focused menu is unmounted', async () => {
  await render();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(anchor);
});

it('discards preparation from a replaced request without arming the new material', async () => {
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof request.preparePermanent>>>();
  request.preparePermanent = vi.fn(() => gate.promise);
  await render();
  await click(button('gallery.app.permanentDelete'));
  request = { ...request, preparePermanent: vi.fn(async () => null) };
  await render();
  gate.resolve({ warning: 'old material warning', confirm });
  await act(async () => {
    await gate.promise;
  });
  expect(document.body.textContent).not.toContain('old material warning');
  expect(button('gallery.app.permanentDelete')).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
});

it('supports menu key navigation and cancels outside or on Tab without committing', async () => {
  await render();
  const move = button('gallery.app.moveToTrash');
  const permanent = button('gallery.app.permanentDelete');
  for (const [key, expected] of [
    ['ArrowDown', permanent],
    ['Home', move],
    ['End', permanent],
    ['ArrowUp', move],
  ] as const) {
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
    );
    expect(document.activeElement).toBe(expected);
  }
  const repeated = new KeyboardEvent('keydown', { key: 'Enter', repeat: true, cancelable: true });
  window.dispatchEvent(repeated);
  expect(repeated.defaultPrevented).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it('preserves pointer modality, dismisses outside and permits retry after failed preparation', async () => {
  request.keyboard = false;
  request.preparePermanent = vi.fn(async () => null);
  anchor.focus();
  await render();
  expect(document.activeElement).toBe(anchor);
  await click(button('gallery.app.permanentDelete'));
  expect(button('gallery.app.permanentDelete')).toBeTruthy();
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(confirm).not.toHaveBeenCalled();
});

it('keeps an unanchored overflow warning bounded and updates placement after resize', async () => {
  request.anchor = null;
  request.keyboard = false;
  const resizeCallbacks: (() => void)[] = [];
  class TestResizeObserver {
    constructor(callback: () => void) {
      resizeCallbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  try {
    await render();
    const surface = document.querySelector<HTMLElement>('[data-ui="gallery.deletion.menu"]');
    if (!surface) throw new Error('Missing deletion surface');
    const height = window.innerHeight + 200;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, height));
    await act(async () => resizeCallbacks.forEach((callback) => callback()));
    expect(surface.parentElement?.style.top).toBe('12px');
    expect(surface.parentElement?.style.left).toBe('12px');
    expect(surface.parentElement?.style.maxHeight).toBe(`${window.innerHeight - 24}px`);
    expect(surface.parentElement?.style.overflowY).toBe('auto');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('announces pending reference checking and resets confirmation on reopening', async () => {
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof request.preparePermanent>>>();
  request.preparePermanent = vi.fn(() => gate.promise);
  await render();
  await click(button('gallery.app.permanentDelete'));
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    translate('gallery.app.deleteChecking')
  );
  expect(button('gallery.app.permanentDelete').getAttribute('aria-disabled')).toBe('true');
  gate.resolve({ warning: 'old confirmation', confirm });
  await act(async () => {
    await gate.promise;
  });
  expect(document.body.textContent).toContain('old confirmation');
  await act(async () => root.render(null));
  await render();
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(button('gallery.app.permanentDelete').hasAttribute('aria-describedby')).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});
